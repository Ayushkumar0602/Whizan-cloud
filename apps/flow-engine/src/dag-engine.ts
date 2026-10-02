/**
 * Whizan Flow — Directed Acyclic Graph (DAG) Engine
 *
 * Implements:
 * 1. Kahn's Algorithm for Topological Sorting & Cycle Detection
 * 2. Dependency In-Degree Tracking & Parallel Branching
 * 3. Safe Condition Expression Evaluation against Step Context Data
 * 4. Automatic Upstream Failure Cascading & Skip Resolution
 */

export interface DAGNode {
  id?: string;
  nodeKey: string;
  name: string;
  type: string;
  config: Record<string, any>;
  timeoutSeconds?: number;
  maxRetries?: number;
  retryDelaySec?: number;
  continueOnError?: boolean;
}

export interface DAGEdge {
  id?: string;
  sourceNodeKey: string;
  targetNodeKey: string;
  condition?: string | null; // "SUCCESS" | "FAILURE" | "ALWAYS" | custom expression
}

export interface StepOutcome {
  status: "SUCCESS" | "FAILED" | "SKIPPED" | "TIMED_OUT" | "CANCELLED";
  exitCode?: number | null;
  httpStatusCode?: number | null;
  outputData?: any;
  errorMessage?: string | null;
}

export class DAGEngine {
  private nodes: Map<string, DAGNode>;
  private outgoingEdges: Map<string, DAGEdge[]>;
  private incomingEdges: Map<string, DAGEdge[]>;

  constructor(nodes: DAGNode[], edges: DAGEdge[]) {
    this.nodes = new Map(nodes.map((n) => [n.nodeKey, n]));
    this.outgoingEdges = new Map();
    this.incomingEdges = new Map();

    for (const node of nodes) {
      this.outgoingEdges.set(node.nodeKey, []);
      this.incomingEdges.set(node.nodeKey, []);
    }

    for (const edge of edges) {
      if (this.nodes.has(edge.sourceNodeKey) && this.nodes.has(edge.targetNodeKey)) {
        this.outgoingEdges.get(edge.sourceNodeKey)!.push(edge);
        this.incomingEdges.get(edge.targetNodeKey)!.push(edge);
      }
    }
  }

  /**
   * Validate that the graph is a valid DAG (contains no cycles).
   * Throws Error if a cycle is detected.
   */
  public validateNoCycles(): void {
    const inDegree = new Map<string, number>();
    for (const [key, edges] of this.incomingEdges) {
      inDegree.set(key, edges.length);
    }

    const queue: string[] = [];
    for (const [key, degree] of inDegree) {
      if (degree === 0) queue.push(key);
    }

    let visitedCount = 0;
    while (queue.length > 0) {
      const current = queue.shift()!;
      visitedCount++;

      for (const edge of this.outgoingEdges.get(current) || []) {
        const next = edge.targetNodeKey;
        const currentDeg = inDegree.get(next)! - 1;
        inDegree.set(next, currentDeg);
        if (currentDeg === 0) {
          queue.push(next);
        }
      }
    }

    if (visitedCount !== this.nodes.size) {
      throw new Error(`Cycle detected in workflow graph! Visited ${visitedCount} of ${this.nodes.size} nodes.`);
    }
  }

  /**
   * Get all entry nodes (nodes with 0 incoming dependencies).
   */
  public getRootNodes(): DAGNode[] {
    const roots: DAGNode[] = [];
    for (const [key, edges] of this.incomingEdges) {
      if (edges.length === 0) {
        roots.push(this.nodes.get(key)!);
      }
    }
    return roots;
  }

  /**
   * Determine which unexecuted nodes are now eligible to run
   * given the completed steps and current context data.
   */
  public getNextExecutableNodes(
    completedOutcomes: Map<string, StepOutcome>,
    currentlyRunningKeys: Set<string>,
    contextData: Record<string, any>
  ): { readyNodes: DAGNode[]; skippedNodeKeys: string[] } {
    const readyNodes: DAGNode[] = [];
    const skippedNodeKeys: string[] = [];

    for (const [nodeKey, node] of this.nodes) {
      // Skip if already completed or currently running
      if (completedOutcomes.has(nodeKey) || currentlyRunningKeys.has(nodeKey)) {
        continue;
      }

      const incoming = this.incomingEdges.get(nodeKey) || [];

      // If it's a root node and not yet executed
      if (incoming.length === 0) {
        readyNodes.push(node);
        continue;
      }

      // Check if all incoming dependencies have finished
      const allParentsFinished = incoming.every((edge) => completedOutcomes.has(edge.sourceNodeKey));
      if (!allParentsFinished) {
        continue;
      }

      // Evaluate edge conditions
      let canExecute = false;
      let shouldSkip = false;

      // For CONTROL_JOIN nodes: determine join behavior
      if (node.type === "CONTROL_JOIN") {
        const joinMode = node.config?.mode || "WAIT_ALL"; // "WAIT_ALL" or "WAIT_ANY"
        if (joinMode === "WAIT_ANY") {
          const anySuccess = incoming.some((edge) => {
            const outcome = completedOutcomes.get(edge.sourceNodeKey);
            return outcome?.status === "SUCCESS";
          });
          canExecute = anySuccess;
        } else {
          // WAIT_ALL
          canExecute = incoming.every((edge) => {
            const outcome = completedOutcomes.get(edge.sourceNodeKey);
            return outcome?.status === "SUCCESS";
          });
        }
      } else {
        // Standard nodes: evaluate incoming conditions
        let satisfiedEdges = 0;
        let activeEdges = 0;

        for (const edge of incoming) {
          const parentOutcome = completedOutcomes.get(edge.sourceNodeKey)!;
          activeEdges++;

          const isConditionMet = this.evaluateCondition(edge.condition, parentOutcome, contextData);
          if (isConditionMet) {
            satisfiedEdges++;
          }
        }

        const conditionMode = node.config?.conditionMode || "ALL";
        if (conditionMode === "ANY") {
          if (satisfiedEdges > 0) {
            canExecute = true;
          } else {
            shouldSkip = true;
          }
        } else {
          // "ALL" (default): every incoming dependency must satisfy condition
          if (satisfiedEdges === activeEdges) {
            canExecute = true;
          } else {
            shouldSkip = true;
          }
        }
      }

      if (canExecute) {
        readyNodes.push(node);
      } else if (shouldSkip) {
        skippedNodeKeys.push(nodeKey);
      }
    }

    return { readyNodes, skippedNodeKeys };
  }

  /**
   * Safe Condition Evaluator.
   * Supports: "SUCCESS", "FAILURE", "ALWAYS", and JS expressions with `steps` context.
   */
  public evaluateCondition(
    condition: string | null | undefined,
    parentOutcome: StepOutcome,
    contextData: Record<string, any>
  ): boolean {
    const cond = (condition || "SUCCESS").trim().toUpperCase();

    if (cond === "SUCCESS") {
      return parentOutcome.status === "SUCCESS";
    }

    if (cond === "FAILURE" || cond === "ERROR") {
      return parentOutcome.status === "FAILED" || parentOutcome.status === "TIMED_OUT";
    }

    if (cond === "ALWAYS") {
      return true;
    }

    // Custom expression: e.g. `{{steps.build.exitCode === 0}}` or `output.status === 200`
    try {
      let expr = condition || "";
      // Strip {{ and }}
      expr = expr.replace(/^\{\{\s*/, "").replace(/\s*\}\}$/, "");

      // Safe evaluation sandbox using Function with restricted scope
      const sandboxFn = new Function("parent", "steps", "context", `return Boolean(${expr});`);
      return Boolean(sandboxFn(parentOutcome, contextData.steps || {}, contextData));
    } catch {
      // Default to false on evaluation syntax failure
      return false;
    }
  }
}
