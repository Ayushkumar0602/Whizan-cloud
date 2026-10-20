/**
 * Build Worker EmailJS Dispatcher for Whizan Cloud
 * Dispatches failure notification emails using template_ernq47u
 */

export const EMAILJS_CONFIG = {
  serviceId: "service_mm6n3jn",
  templateDeploymentFailedId: "template_ernq47u",
  publicKey: "qzhqvM1yerb2R24T1",
  privateKey: "e9Snm4GGkiI1xLel7cLi7",
  endpoint: "https://api.emailjs.com/api/v1.0/email/send",
  defaultLogoUrl: "https://dashboard.whizan.cloud/whizan_logo.png",
};

export interface SendDeploymentFailedOptions {
  email: string;
  userName?: string;
  projectName: string;
  deploymentId: string;
  errorMessage: string;
  dashboardUrl?: string;
  time?: string;
  branch?: string;
  commitHash?: string;
  triggerIp?: string;
  nodeId?: string;
  logoUrl?: string;
}

/**
 * Sends a deployment failure notification to user's email via EmailJS (template_ernq47u)
 */
export async function sendDeploymentFailedEmail(
  options: SendDeploymentFailedOptions
): Promise<{ success: boolean; error?: string }> {
  try {
    const payload = {
      service_id: EMAILJS_CONFIG.serviceId,
      template_id: EMAILJS_CONFIG.templateDeploymentFailedId,
      user_id: EMAILJS_CONFIG.publicKey,
      accessToken: EMAILJS_CONFIG.privateKey,
      template_params: {
        email: options.email.trim().toLowerCase(),
        user_name: options.userName || options.email.split("@")[0],
        project_name: options.projectName,
        deployment_id: options.deploymentId,
        error_message: options.errorMessage,
        dashboard_url: options.dashboardUrl || "https://dashboard.whizan.cloud",
        time: options.time || new Date().toUTCString(),
        branch: options.branch || "main",
        commit_hash: options.commitHash ? options.commitHash.slice(0, 8) : "direct-upload",
        trigger_ip: options.triggerIp || "Cloud Edge",
        node_id: options.nodeId || "whizan-node-01",
        logo_url: options.logoUrl || EMAILJS_CONFIG.defaultLogoUrl,
        app_url: "https://dashboard.whizan.cloud",
      },
    };

    const res = await fetch(EMAILJS_CONFIG.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://dashboard.whizan.cloud",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "Unknown error");
      console.error("[BuildWorker-Email] Failed to send failure alert:", res.status, text);
      return { success: false, error: text };
    }

    console.log(`[BuildWorker-Email] Successfully dispatched deployment failure email to ${options.email}`);
    return { success: true };
  } catch (err: any) {
    console.error("[BuildWorker-Email] Network error sending failure alert:", err.message);
    return { success: false, error: err.message };
  }
}
