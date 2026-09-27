"use client";

import { useState, useEffect } from "react";
import {
  Table,
  Database,
  Plus,
  RotateCcw,
  Search,
  Key,
  Trash2,
  Edit2,
  Download,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Code2,
  Check,
  X,
  AlertTriangle,
  Layers,
  Sparkles,
  Copy,
  Eye,
  EyeOff,
  Lock,
} from "lucide-react";
import {
  databases,
  type ManagedDatabase,
  type DatabaseTableItem,
  type DatabaseColumnSchema,
} from "@/lib/api";
import { isConfidentialKey, ConfidentialBadge } from "@/lib/security-mask";

interface Props {
  database: ManagedDatabase;
  onOpenQuery?: (sql: string) => void;
}

export default function DatabaseTableVisualizer({ database, onOpenQuery }: Props) {
  // Tables list state
  const [tables, setTables] = useState<DatabaseTableItem[]>([]);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [tablesLoading, setTablesLoading] = useState(true);
  const [tablesFilter, setTablesFilter] = useState("");
  const [databaseSize, setDatabaseSize] = useState<string>("0 kB");

  // Active view mode: "data" | "schema"
  const [viewMode, setViewMode] = useState<"data" | "schema">("data");

  // Schema state
  const [columns, setColumns] = useState<DatabaseColumnSchema[]>([]);
  const [schemaLoading, setSchemaLoading] = useState(false);

  // Data rows state
  const [rows, setRows] = useState<Record<string, any>[]>([]);
  const [rowsTotal, setRowsTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<"ASC" | "DESC">("ASC");
  const [dataSearch, setDataSearch] = useState("");
  const [dataLoading, setDataLoading] = useState(false);

  // Modals state
  const [showInsertModal, setShowInsertModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showCreateTableModal, setShowCreateTableModal] = useState(false);
  const [editingRow, setEditingRow] = useState<Record<string, any> | null>(null);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [copiedCell, setCopiedCell] = useState<string | null>(null);
  const [revealTableSecrets, setRevealTableSecrets] = useState(false);

  // Create table form state
  const [newTableName, setNewTableName] = useState("");
  const [newTableCols, setNewTableCols] = useState<
    Array<{ name: string; type: string; isPrimaryKey: boolean; isNullable: boolean; defaultValue: string }>
  >([
    { name: "id", type: "SERIAL", isPrimaryKey: true, isNullable: false, defaultValue: "" },
    { name: "title", type: "VARCHAR(255)", isPrimaryKey: false, isNullable: false, defaultValue: "" },
    { name: "created_at", type: "TIMESTAMP", isPrimaryKey: false, isNullable: true, defaultValue: "CURRENT_TIMESTAMP" },
  ]);

  // Load tables list
  async function loadTables() {
    setTablesLoading(true);
    try {
      const res = await databases.getTables(database.id);
      setTables(res.tables || []);
      setDatabaseSize(res.databaseSize || "N/A");
      if (res.tables && res.tables.length > 0 && !selectedTable) {
        setSelectedTable(res.tables[0].table_name);
      }
    } catch (err: any) {
      console.error("Failed to load tables:", err);
    } finally {
      setTablesLoading(false);
    }
  }

  useEffect(() => {
    loadTables();
  }, [database.id]);

  // Load schema and data when selectedTable changes
  useEffect(() => {
    if (!selectedTable) return;
    loadSchema(selectedTable);
    loadData(selectedTable, 1, sortColumn, sortOrder, dataSearch);
  }, [selectedTable]);

  async function loadSchema(tableName: string) {
    setSchemaLoading(true);
    try {
      const res = await databases.getTableSchema(database.id, tableName);
      setColumns(res.columns || []);
    } catch (err) {
      console.error(err);
    } finally {
      setSchemaLoading(false);
    }
  }

  async function loadData(
    tableName: string,
    p = page,
    sCol = sortColumn,
    sOrder = sortOrder,
    search = dataSearch
  ) {
    setDataLoading(true);
    try {
      const res = await databases.getTableData(database.id, tableName, {
        page: p,
        limit,
        sortColumn: sCol || undefined,
        sortOrder: sOrder,
        search: search || undefined,
      });
      setRows(res.rows || []);
      setRowsTotal(res.totalCount || 0);
      setPage(res.page || p);
    } catch (err) {
      console.error(err);
    } finally {
      setDataLoading(false);
    }
  }

  function handleSort(colName: string) {
    let nextOrder: "ASC" | "DESC" = "ASC";
    if (sortColumn === colName) {
      nextOrder = sortOrder === "ASC" ? "DESC" : "ASC";
    }
    setSortColumn(colName);
    setSortOrder(nextOrder);
    if (selectedTable) {
      loadData(selectedTable, 1, colName, nextOrder, dataSearch);
    }
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (selectedTable) {
      loadData(selectedTable, 1, sortColumn, sortOrder, dataSearch);
    }
  }

  function getPrimaryColumn() {
    const pk = columns.find((c) => c.is_primary_key);
    return pk ? pk.column_name : columns[0]?.column_name || "id";
  }

  // Row Delete
  async function handleDeleteRow(row: Record<string, any>) {
    const pkCol = getPrimaryColumn();
    const pkVal = row[pkCol];
    if (pkVal === undefined) {
      alert("Cannot delete: Primary key value not found");
      return;
    }
    if (!confirm(`Are you sure you want to delete row where ${pkCol} = ${pkVal}?`)) return;

    try {
      await databases.deleteRow(database.id, selectedTable!, { column: pkCol, value: pkVal });
      if (selectedTable) {
        loadData(selectedTable, page, sortColumn, sortOrder, dataSearch);
        loadTables();
      }
    } catch (err: any) {
      alert(err.message || "Failed to delete row");
    }
  }

  // Row Insert
  async function handleInsertSubmit(e: React.FormEvent) {
    e.preventDefault();
    setModalLoading(true);
    setModalError(null);
    try {
      await databases.insertRow(database.id, selectedTable!, formData);
      setShowInsertModal(false);
      setFormData({});
      if (selectedTable) {
        loadData(selectedTable, 1, sortColumn, sortOrder, dataSearch);
        loadTables();
      }
    } catch (err: any) {
      setModalError(err.message || "Failed to insert row");
    } finally {
      setModalLoading(false);
    }
  }

  // Row Edit
  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingRow) return;
    const pkCol = getPrimaryColumn();
    const pkVal = editingRow[pkCol];
    setModalLoading(true);
    setModalError(null);
    try {
      await databases.updateRow(database.id, selectedTable!, { column: pkCol, value: pkVal }, formData);
      setShowEditModal(false);
      setEditingRow(null);
      setFormData({});
      if (selectedTable) {
        loadData(selectedTable, page, sortColumn, sortOrder, dataSearch);
      }
    } catch (err: any) {
      setModalError(err.message || "Failed to update row");
    } finally {
      setModalLoading(false);
    }
  }

  function openEditModal(row: Record<string, any>) {
    setEditingRow(row);
    setFormData({ ...row });
    setModalError(null);
    setShowEditModal(true);
  }

  function openInsertModal() {
    const defaults: Record<string, any> = {};
    columns.forEach((col) => {
      if (!col.is_primary_key) {
        defaults[col.column_name] = "";
      }
    });
    setFormData(defaults);
    setModalError(null);
    setShowInsertModal(true);
  }

  // Drop Table
  async function handleDropTable() {
    if (!selectedTable) return;
    if (
      !confirm(
        `⚠️ DANGER: Are you sure you want to permanently drop table '${selectedTable}'?\nAll data in this table will be deleted.`
      )
    )
      return;

    try {
      await databases.dropTable(database.id, selectedTable);
      setSelectedTable(null);
      await loadTables();
    } catch (err: any) {
      alert(err.message || "Failed to drop table");
    }
  }

  // Create Table submit
  async function handleCreateTableSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!newTableName.trim()) {
      setModalError("Table name is required");
      return;
    }
    setModalLoading(true);
    setModalError(null);
    try {
      await databases.createTable(database.id, newTableName.trim(), newTableCols);
      setShowCreateTableModal(false);
      setNewTableName("");
      await loadTables();
      setSelectedTable(newTableName.trim());
    } catch (err: any) {
      setModalError(err.message || "Failed to create table");
    } finally {
      setModalLoading(false);
    }
  }

  function copyText(text: string, id: string) {
    navigator.clipboard.writeText(text);
    setCopiedCell(id);
    setTimeout(() => setCopiedCell(null), 1500);
  }

  function exportCSV() {
    if (!rows || rows.length === 0) return;
    const headers = Object.keys(rows[0]);
    const csvRows = [
      headers.join(","),
      ...rows.map((row) =>
        headers
          .map((h) => {
            const val = row[h];
            const str = val === null || val === undefined ? "" : typeof val === "object" ? JSON.stringify(val) : String(val);
            return `"${str.replace(/"/g, '""')}"`;
          })
          .join(",")
      ),
    ];
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${selectedTable || "table"}-export.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const filteredTables = tables.filter((t) =>
    t.table_name.toLowerCase().includes(tablesFilter.toLowerCase())
  );

  const selectedTableObj = tables.find((t) => t.table_name === selectedTable);
  const totalPages = Math.ceil(rowsTotal / limit) || 1;

  // DDL Generator
  const generatedDDL = selectedTable
    ? `CREATE TABLE "${selectedTable}" (\n  ${columns
        .map((c) => {
          let s = `"${c.column_name}" ${c.data_type.toUpperCase()}`;
          if (c.is_primary_key) s += " PRIMARY KEY";
          if (!c.is_nullable) s += " NOT NULL";
          if (c.column_default) s += ` DEFAULT ${c.column_default}`;
          return s;
        })
        .join(",\n  ")}\n);`
    : "";

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "280px 1fr",
        gap: "1.25rem",
        minHeight: 650,
      }}
    >
      {/* ── LEFT COLUMN: TABLES SIDEBAR ─────────────────────────────────── */}
      <div
        style={{
          background: "var(--card)",
          border: "1px solid var(--card-border)",
          borderRadius: "var(--radius)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Sidebar Header */}
        <div
          style={{
            padding: "1rem",
            background: "var(--bg-inset)",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div style={{ fontSize: "0.85rem", fontWeight: 700, display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <Database size={15} style={{ color: "var(--accent)" }} />
              Tables ({tables.length})
            </div>
            <div style={{ fontSize: "0.72rem", color: "var(--muted)", marginTop: 2 }}>
              Storage: {databaseSize}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
            <button
              onClick={loadTables}
              style={{
                background: "transparent",
                border: "1px solid var(--border)",
                borderRadius: 4,
                padding: "4px 6px",
                color: "var(--muted)",
                cursor: "pointer",
              }}
              title="Refresh Tables"
            >
              <RotateCcw size={12} />
            </button>

            <button
              onClick={() => {
                setShowCreateTableModal(true);
                setModalError(null);
              }}
              style={{
                background: "var(--accent)",
                color: "#fff",
                border: "none",
                borderRadius: 4,
                padding: "4px 8px",
                fontSize: "0.75rem",
                fontWeight: 700,
                display: "inline-flex",
                alignItems: "center",
                gap: "0.25rem",
                cursor: "pointer",
              }}
            >
              <Plus size={12} />
              New
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div style={{ padding: "0.6rem 0.75rem", borderBottom: "1px solid var(--border)" }}>
          <div
            style={{
              position: "relative",
              display: "flex",
              alignItems: "center",
            }}
          >
            <Search size={13} style={{ position: "absolute", left: 8, color: "var(--muted)" }} />
            <input
              type="text"
              placeholder="Search tables..."
              value={tablesFilter}
              onChange={(e) => setTablesFilter(e.target.value)}
              style={{
                width: "100%",
                padding: "0.35rem 0.5rem 0.35rem 1.75rem",
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: 4,
                fontSize: "0.8rem",
                color: "var(--foreground)",
                outline: "none",
              }}
            />
          </div>
        </div>

        {/* Tables Navigation List */}
        <div style={{ flex: 1, overflowY: "auto", padding: "0.5rem" }}>
          {tablesLoading ? (
            <div style={{ padding: "2rem", textAlign: "center", color: "var(--muted)", fontSize: "0.85rem" }}>
              <div className="spinner" style={{ margin: "0 auto 0.5rem", width: 18, height: 18 }} />
              Loading tables...
            </div>
          ) : filteredTables.length === 0 ? (
            <div style={{ padding: "2rem 1rem", textAlign: "center", color: "var(--muted)", fontSize: "0.8rem" }}>
              No tables found.
              <br />
              Click <strong>+ New</strong> to create one.
            </div>
          ) : (
            filteredTables.map((tbl) => {
              const isSelected = tbl.table_name === selectedTable;
              return (
                <button
                  key={tbl.table_name}
                  onClick={() => {
                    setSelectedTable(tbl.table_name);
                    setPage(1);
                    setSortColumn(null);
                    setDataSearch("");
                  }}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "0.55rem 0.65rem",
                    borderRadius: 6,
                    border: isSelected ? "1px solid var(--accent)" : "1px solid transparent",
                    background: isSelected ? "rgba(99, 102, 241, 0.12)" : "transparent",
                    color: isSelected ? "var(--accent)" : "var(--foreground)",
                    textAlign: "left",
                    cursor: "pointer",
                    marginBottom: 4,
                    transition: "all 0.15s",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", minWidth: 0 }}>
                    <Table size={14} style={{ flexShrink: 0, opacity: isSelected ? 1 : 0.6 }} />
                    <span
                      style={{
                        fontWeight: isSelected ? 700 : 500,
                        fontSize: "0.85rem",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {tbl.table_name}
                    </span>
                  </div>

                  <span
                    style={{
                      fontSize: "0.7rem",
                      fontWeight: 600,
                      padding: "2px 6px",
                      borderRadius: 4,
                      background: isSelected ? "var(--accent)" : "var(--bg-inset)",
                      color: isSelected ? "#fff" : "var(--muted)",
                      flexShrink: 0,
                    }}
                  >
                    {tbl.rows}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ── RIGHT COLUMN: TABLE VISUALIZER & EDITOR ─────────────────────── */}
      <div
        style={{
          background: "var(--card)",
          border: "1px solid var(--card-border)",
          borderRadius: "var(--radius)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {selectedTable ? (
          <>
            {/* Table Details Header Bar */}
            <div
              style={{
                padding: "1rem 1.25rem",
                background: "var(--bg-inset)",
                borderBottom: "1px solid var(--border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: "0.75rem",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 8,
                    background: "rgba(99, 102, 241, 0.15)",
                    border: "1px solid rgba(99, 102, 241, 0.3)",
                    color: "var(--accent)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Table size={20} />
                </div>

                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <h2 style={{ fontSize: "1.15rem", fontWeight: 800 }}>{selectedTable}</h2>
                    <span
                      style={{
                        fontSize: "0.75rem",
                        padding: "2px 8px",
                        borderRadius: 4,
                        background: "var(--card)",
                        border: "1px solid var(--border)",
                        color: "var(--muted)",
                      }}
                    >
                      {rowsTotal} {rowsTotal === 1 ? "record" : "records"}
                    </span>
                    {selectedTableObj?.size && (
                      <span
                        style={{
                          fontSize: "0.75rem",
                          padding: "2px 8px",
                          borderRadius: 4,
                          background: "var(--card)",
                          border: "1px solid var(--border)",
                          color: "var(--muted)",
                        }}
                      >
                        {selectedTableObj.size}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* View Switcher & Action Toolbar */}
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                {/* Mode Switcher */}
                <div
                  style={{
                    display: "flex",
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    padding: 2,
                  }}
                >
                  <button
                    onClick={() => setViewMode("data")}
                    style={{
                      padding: "0.35rem 0.75rem",
                      borderRadius: 4,
                      border: "none",
                      background: viewMode === "data" ? "var(--accent)" : "transparent",
                      color: viewMode === "data" ? "#fff" : "var(--muted)",
                      fontSize: "0.78rem",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Data Grid
                  </button>
                  <button
                    onClick={() => setViewMode("schema")}
                    style={{
                      padding: "0.35rem 0.75rem",
                      borderRadius: 4,
                      border: "none",
                      background: viewMode === "schema" ? "var(--accent)" : "transparent",
                      color: viewMode === "schema" ? "#fff" : "var(--muted)",
                      fontSize: "0.78rem",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Schema
                  </button>
                </div>

                {viewMode === "data" && (
                  <>
                    <button
                      onClick={openInsertModal}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.3rem",
                        padding: "0.4rem 0.8rem",
                        background: "var(--accent)",
                        color: "#fff",
                        border: "none",
                        borderRadius: 6,
                        fontSize: "0.8rem",
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      <Plus size={14} />
                      Insert Row
                    </button>

                    <button
                      onClick={exportCSV}
                      disabled={rows.length === 0}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.3rem",
                        padding: "0.4rem 0.75rem",
                        background: "var(--card)",
                        border: "1px solid var(--border)",
                        borderRadius: 6,
                        fontSize: "0.8rem",
                        color: "var(--foreground)",
                        cursor: rows.length === 0 ? "not-allowed" : "pointer",
                        opacity: rows.length === 0 ? 0.5 : 1,
                      }}
                      title="Export CSV"
                    >
                      <Download size={13} />
                      Export
                    </button>

                    <button
                      onClick={() => setRevealTableSecrets(!revealTableSecrets)}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.3rem",
                        padding: "0.4rem 0.75rem",
                        background: "var(--card)",
                        border: "1px solid var(--border)",
                        borderRadius: 6,
                        fontSize: "0.8rem",
                        color: revealTableSecrets ? "#f59e0b" : "var(--foreground)",
                        cursor: "pointer",
                      }}
                      title={revealTableSecrets ? "Mask confidential columns" : "Reveal confidential columns"}
                    >
                      {revealTableSecrets ? <EyeOff size={13} /> : <Eye size={13} />}
                      {revealTableSecrets ? "Hide Secrets" : "Reveal Secrets"}
                    </button>
                  </>
                )}

                {onOpenQuery && (
                  <button
                    onClick={() => onOpenQuery(`SELECT * FROM "${selectedTable}" LIMIT 50;`)}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.3rem",
                      padding: "0.4rem 0.75rem",
                      background: "var(--card)",
                      border: "1px solid var(--border)",
                      borderRadius: 6,
                      fontSize: "0.8rem",
                      color: "var(--foreground)",
                      cursor: "pointer",
                    }}
                    title="Open Table in SQL Editor"
                  >
                    <Code2 size={13} />
                    SQL
                  </button>
                )}

                <button
                  onClick={handleDropTable}
                  style={{
                    padding: "0.4rem 0.6rem",
                    background: "rgba(239, 68, 68, 0.1)",
                    border: "1px solid rgba(239, 68, 68, 0.25)",
                    borderRadius: 6,
                    color: "#ef4444",
                    fontSize: "0.8rem",
                    cursor: "pointer",
                  }}
                  title="Drop Table"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>

            {/* ─── DATA GRID VIEW ─────────────────────────────────────── */}
            {viewMode === "data" ? (
              <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
                {/* Search & Filter Bar */}
                <div
                  style={{
                    padding: "0.6rem 1rem",
                    borderBottom: "1px solid var(--border)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "1rem",
                  }}
                >
                  <form onSubmit={handleSearchSubmit} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                      <Search size={13} style={{ position: "absolute", left: 8, color: "var(--muted)" }} />
                      <input
                        type="text"
                        placeholder="Search records..."
                        value={dataSearch}
                        onChange={(e) => setDataSearch(e.target.value)}
                        style={{
                          width: 220,
                          padding: "0.35rem 0.5rem 0.35rem 1.75rem",
                          background: "var(--bg-inset)",
                          border: "1px solid var(--border)",
                          borderRadius: 4,
                          fontSize: "0.8rem",
                          color: "var(--foreground)",
                          outline: "none",
                        }}
                      />
                    </div>
                    <button
                      type="submit"
                      style={{
                        padding: "0.35rem 0.65rem",
                        fontSize: "0.78rem",
                        background: "var(--card)",
                        border: "1px solid var(--border)",
                        borderRadius: 4,
                        color: "var(--foreground)",
                        cursor: "pointer",
                      }}
                    >
                      Filter
                    </button>
                  </form>

                  {/* Refresh Table Data */}
                  <button
                    onClick={() => loadData(selectedTable, page, sortColumn, sortOrder, dataSearch)}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.3rem",
                      padding: "0.35rem 0.65rem",
                      fontSize: "0.78rem",
                      background: "transparent",
                      border: "1px solid var(--border)",
                      borderRadius: 4,
                      color: "var(--muted)",
                      cursor: "pointer",
                    }}
                  >
                    <RotateCcw size={12} />
                    Refresh
                  </button>
                </div>

                {/* Grid Table */}
                <div style={{ flex: 1, overflowX: "auto", maxHeight: 520 }}>
                  {dataLoading ? (
                    <div style={{ padding: "4rem", textAlign: "center", color: "var(--muted)" }}>
                      <div className="spinner" style={{ margin: "0 auto 1rem", width: 22, height: 22 }} />
                      Loading table rows...
                    </div>
                  ) : rows.length === 0 ? (
                    <div style={{ padding: "4rem 2rem", textAlign: "center", color: "var(--muted)" }}>
                      <Table size={36} style={{ margin: "0 auto 0.75rem", opacity: 0.4 }} />
                      <p style={{ fontWeight: 600, fontSize: "0.95rem" }}>No rows in this table yet</p>
                      <p style={{ fontSize: "0.8rem", marginTop: "0.3rem" }}>
                        Click &quot;Insert Row&quot; above to add your first record.
                      </p>
                      <button
                        onClick={openInsertModal}
                        style={{
                          marginTop: "1rem",
                          padding: "0.45rem 1rem",
                          background: "var(--accent)",
                          color: "#fff",
                          border: "none",
                          borderRadius: 6,
                          fontSize: "0.85rem",
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        + Insert First Row
                      </button>
                    </div>
                  ) : (
                    <table
                      style={{
                        width: "100%",
                        borderCollapse: "collapse",
                        textAlign: "left",
                        fontSize: "0.82rem",
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
                      }}
                    >
                      <thead>
                        <tr style={{ background: "rgba(255, 255, 255, 0.02)", borderBottom: "1px solid var(--border)" }}>
                          <th style={{ padding: "0.6rem 0.75rem", width: 90, color: "var(--muted)", fontWeight: 700 }}>
                            Actions
                          </th>
                          {columns.map((col) => {
                            const isSorted = sortColumn === col.column_name;
                            return (
                              <th
                                key={col.column_name}
                                onClick={() => handleSort(col.column_name)}
                                style={{
                                  padding: "0.6rem 0.75rem",
                                  color: "var(--foreground)",
                                  fontWeight: 700,
                                  borderRight: "1px solid rgba(255,255,255,0.05)",
                                  whiteSpace: "nowrap",
                                  cursor: "pointer",
                                  userSelect: "none",
                                }}
                              >
                                <span style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
                                  {col.is_primary_key && <Key size={12} style={{ color: "#f59e0b" }} />}
                                  {col.column_name}
                                  {isConfidentialKey(col.column_name) && (
                                    <ConfidentialBadge size="xs" label="Secret" />
                                  )}
                                  {isSorted && (
                                    <span style={{ fontSize: "0.7rem", color: "var(--accent)" }}>
                                      {sortOrder === "ASC" ? "▲" : "▼"}
                                    </span>
                                  )}
                                </span>
                              </th>
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row, rowIdx) => (
                          <tr
                            key={rowIdx}
                            style={{
                              borderBottom: "1px solid rgba(255,255,255,0.04)",
                              background: rowIdx % 2 === 0 ? "transparent" : "rgba(255, 255, 255, 0.015)",
                            }}
                          >
                            <td
                              style={{
                                padding: "0.5rem 0.75rem",
                                borderRight: "1px solid rgba(255,255,255,0.05)",
                              }}
                            >
                              <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                                <button
                                  onClick={() => openEditModal(row)}
                                  style={{
                                    background: "transparent",
                                    border: "none",
                                    color: "var(--muted)",
                                    cursor: "pointer",
                                    padding: 2,
                                  }}
                                  title="Edit row"
                                >
                                  <Edit2 size={13} />
                                </button>
                                <button
                                  onClick={() => handleDeleteRow(row)}
                                  style={{
                                    background: "transparent",
                                    border: "none",
                                    color: "#ef4444",
                                    cursor: "pointer",
                                    padding: 2,
                                  }}
                                  title="Delete row"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </td>

                            {columns.map((col) => {
                              const val = row[col.column_name];
                              const cellId = `${rowIdx}-${col.column_name}`;
                              const isNull = val === null || val === undefined;
                              const isBool = typeof val === "boolean";
                              const isSecret = isConfidentialKey(col.column_name);
                              const rawString = isNull
                                ? "NULL"
                                : typeof val === "object"
                                ? JSON.stringify(val)
                                : String(val);
                              const displayVal = isSecret && !revealTableSecrets ? "••••••••••••" : rawString;

                              return (
                                <td
                                  key={col.column_name}
                                  onClick={() => copyText(rawString, cellId)}
                                  style={{
                                    padding: "0.5rem 0.75rem",
                                    maxWidth: 300,
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                    borderRight: "1px solid rgba(255,255,255,0.05)",
                                    cursor: "pointer",
                                    color: isNull
                                      ? "var(--muted)"
                                      : isSecret && !revealTableSecrets
                                      ? "#f59e0b"
                                      : isBool
                                      ? val
                                        ? "#10b981"
                                        : "#ef4444"
                                      : typeof val === "number"
                                      ? "#60a5fa"
                                      : "var(--foreground)",
                                    fontStyle: isNull ? "italic" : "normal",
                                  }}
                                  title={isSecret ? "Confidential field (click to copy real value)" : "Click to copy"}
                                >
                                  <span style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
                                    {isSecret && !revealTableSecrets && <Lock size={11} />}
                                    {displayVal}
                                    {copiedCell === cellId && <Check size={11} style={{ color: "#10b981" }} />}
                                  </span>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* Pagination Footer */}
                <div
                  style={{
                    padding: "0.6rem 1rem",
                    borderTop: "1px solid var(--border)",
                    background: "var(--bg-inset)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    fontSize: "0.8rem",
                    color: "var(--muted)",
                  }}
                >
                  <div>
                    Showing {rows.length > 0 ? (page - 1) * limit + 1 : 0} –{" "}
                    {Math.min(page * limit, rowsTotal)} of {rowsTotal} rows
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <button
                      onClick={() => {
                        const newPage = Math.max(1, page - 1);
                        setPage(newPage);
                        loadData(selectedTable, newPage, sortColumn, sortOrder, dataSearch);
                      }}
                      disabled={page <= 1}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 2,
                        padding: "0.3rem 0.5rem",
                        background: "var(--card)",
                        border: "1px solid var(--border)",
                        borderRadius: 4,
                        color: "var(--foreground)",
                        cursor: page <= 1 ? "not-allowed" : "pointer",
                        opacity: page <= 1 ? 0.5 : 1,
                      }}
                    >
                      <ChevronLeft size={14} /> Prev
                    </button>

                    <span>
                      Page {page} of {totalPages}
                    </span>

                    <button
                      onClick={() => {
                        const newPage = Math.min(totalPages, page + 1);
                        setPage(newPage);
                        loadData(selectedTable, newPage, sortColumn, sortOrder, dataSearch);
                      }}
                      disabled={page >= totalPages}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 2,
                        padding: "0.3rem 0.5rem",
                        background: "var(--card)",
                        border: "1px solid var(--border)",
                        borderRadius: 4,
                        color: "var(--foreground)",
                        cursor: page >= totalPages ? "not-allowed" : "pointer",
                        opacity: page >= totalPages ? 0.5 : 1,
                      }}
                    >
                      Next <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              /* ─── SCHEMA BLUEPRINT VIEW ──────────────────────────────── */
              <div style={{ padding: "1.25rem", display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                <div>
                  <h3 style={{ fontSize: "0.95rem", fontWeight: 700, marginBottom: "0.75rem" }}>Columns Schema</h3>
                  <div
                    style={{
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-sm)",
                      overflow: "hidden",
                    }}
                  >
                    <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.85rem" }}>
                      <thead>
                        <tr style={{ background: "var(--bg-inset)", borderBottom: "1px solid var(--border)" }}>
                          <th style={{ padding: "0.6rem 0.75rem", fontWeight: 700 }}>Column</th>
                          <th style={{ padding: "0.6rem 0.75rem", fontWeight: 700 }}>Type</th>
                          <th style={{ padding: "0.6rem 0.75rem", fontWeight: 700 }}>Key</th>
                          <th style={{ padding: "0.6rem 0.75rem", fontWeight: 700 }}>Nullable</th>
                          <th style={{ padding: "0.6rem 0.75rem", fontWeight: 700 }}>Default</th>
                        </tr>
                      </thead>
                      <tbody>
                        {columns.map((col) => (
                          <tr key={col.column_name} style={{ borderBottom: "1px solid var(--border)" }}>
                            <td style={{ padding: "0.6rem 0.75rem", fontWeight: 600 }}>
                              <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                                {col.is_primary_key && <Key size={13} style={{ color: "#f59e0b" }} />}
                                <code>{col.column_name}</code>
                              </span>
                            </td>
                            <td style={{ padding: "0.6rem 0.75rem" }}>
                              <span
                                style={{
                                  fontSize: "0.75rem",
                                  fontWeight: 700,
                                  padding: "2px 7px",
                                  borderRadius: 4,
                                  background: "rgba(59, 130, 246, 0.12)",
                                  color: "#60a5fa",
                                }}
                              >
                                {col.data_type.toUpperCase()}
                              </span>
                            </td>
                            <td style={{ padding: "0.6rem 0.75rem" }}>
                              {col.is_primary_key ? (
                                <span
                                  style={{
                                    fontSize: "0.72rem",
                                    fontWeight: 700,
                                    padding: "2px 6px",
                                    borderRadius: 4,
                                    background: "rgba(245, 158, 11, 0.15)",
                                    color: "#f59e0b",
                                  }}
                                >
                                  PRIMARY KEY
                                </span>
                              ) : (
                                <span style={{ color: "var(--muted)" }}>-</span>
                              )}
                            </td>
                            <td style={{ padding: "0.6rem 0.75rem" }}>
                              {col.is_nullable ? (
                                <span style={{ color: "var(--muted)", fontSize: "0.8rem" }}>NULL</span>
                              ) : (
                                <span style={{ color: "#ef4444", fontWeight: 600, fontSize: "0.8rem" }}>NOT NULL</span>
                              )}
                            </td>
                            <td style={{ padding: "0.6rem 0.75rem", color: "var(--muted)", fontSize: "0.8rem" }}>
                              {col.column_default ? <code>{col.column_default}</code> : "-"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* DDL Definition */}
                <div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: "0.5rem",
                    }}
                  >
                    <h3 style={{ fontSize: "0.95rem", fontWeight: 700 }}>SQL Table Definition (DDL)</h3>
                    <button
                      onClick={() => copyText(generatedDDL, "ddl")}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.3rem",
                        padding: "0.3rem 0.6rem",
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        background: "var(--card)",
                        border: "1px solid var(--border)",
                        borderRadius: 4,
                        color: "var(--foreground)",
                        cursor: "pointer",
                      }}
                    >
                      {copiedCell === "ddl" ? <Check size={12} style={{ color: "#10b981" }} /> : <Copy size={12} />}
                      Copy DDL
                    </button>
                  </div>
                  <pre
                    style={{
                      padding: "1rem",
                      background: "#090d16",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-sm)",
                      fontSize: "0.85rem",
                      color: "#93c5fd",
                      overflowX: "auto",
                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                    }}
                  >
                    {generatedDDL}
                  </pre>
                </div>
              </div>
            )}
          </>
        ) : (
          <div style={{ padding: "4rem", textAlign: "center", color: "var(--muted)" }}>
            <Table size={40} style={{ margin: "0 auto 1rem", opacity: 0.4 }} />
            <p style={{ fontWeight: 600 }}>Select a table on the left or create a new one.</p>
          </div>
        )}
      </div>

      {/* ── MODAL: INSERT ROW ─────────────────────────────────────────── */}
      {showInsertModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
            padding: "1rem",
          }}
        >
          <div
            style={{
              background: "var(--card)",
              border: "1px solid var(--card-border)",
              borderRadius: "var(--radius)",
              width: "100%",
              maxWidth: 540,
              maxHeight: "90vh",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "1rem 1.25rem",
                borderBottom: "1px solid var(--border)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <h3 style={{ fontSize: "1.05rem", fontWeight: 700 }}>Insert Row into &quot;{selectedTable}&quot;</h3>
              <button
                onClick={() => setShowInsertModal(false)}
                style={{ background: "transparent", border: "none", color: "var(--muted)", cursor: "pointer" }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleInsertSubmit} style={{ padding: "1.25rem", overflowY: "auto", flex: 1 }}>
              {modalError && (
                <div
                  style={{
                    padding: "0.75rem",
                    background: "rgba(239, 68, 68, 0.1)",
                    border: "1px solid rgba(239, 68, 68, 0.25)",
                    borderRadius: 4,
                    color: "#ef4444",
                    fontSize: "0.85rem",
                    marginBottom: "1rem",
                  }}
                >
                  {modalError}
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                {columns.map((col) => {
                  const isAutoIncrement =
                    col.is_primary_key && col.column_default?.includes("nextval");

                  return (
                    <div key={col.column_name}>
                      <label
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          fontSize: "0.85rem",
                          fontWeight: 600,
                          marginBottom: "0.3rem",
                        }}
                      >
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
                          {col.column_name}
                          {col.is_primary_key && <Key size={12} style={{ color: "#f59e0b" }} />}
                          {!col.is_nullable && <span style={{ color: "#ef4444" }}>*</span>}
                        </span>
                        <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
                          {col.data_type} {isAutoIncrement && "(auto-generated)"}
                        </span>
                      </label>

                      {col.data_type === "boolean" ? (
                        <select
                          value={formData[col.column_name] ?? ""}
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              [col.column_name]: e.target.value === "true",
                            }))
                          }
                          style={{
                            width: "100%",
                            padding: "0.55rem",
                            borderRadius: 6,
                            background: "var(--bg-inset)",
                            border: "1px solid var(--border)",
                            color: "var(--foreground)",
                          }}
                        >
                          <option value="">(Default / NULL)</option>
                          <option value="true">true</option>
                          <option value="false">false</option>
                        </select>
                      ) : col.data_type === "jsonb" || col.data_type === "json" ? (
                        <textarea
                          placeholder='{"key": "value"}'
                          rows={3}
                          value={formData[col.column_name] || ""}
                          onChange={(e) =>
                            setFormData((prev) => ({ ...prev, [col.column_name]: e.target.value }))
                          }
                          style={{
                            width: "100%",
                            padding: "0.55rem",
                            borderRadius: 6,
                            background: "var(--bg-inset)",
                            border: "1px solid var(--border)",
                            color: "var(--foreground)",
                            fontFamily: "monospace",
                            fontSize: "0.85rem",
                          }}
                        />
                      ) : (
                        <input
                          type={
                            col.data_type.includes("int") || col.data_type === "numeric"
                              ? "number"
                              : "text"
                          }
                          placeholder={isAutoIncrement ? "(Auto-incremented on submit)" : col.column_default || ""}
                          value={formData[col.column_name] ?? ""}
                          onChange={(e) =>
                            setFormData((prev) => ({ ...prev, [col.column_name]: e.target.value }))
                          }
                          style={{
                            width: "100%",
                            padding: "0.55rem",
                            borderRadius: 6,
                            background: "var(--bg-inset)",
                            border: "1px solid var(--border)",
                            color: "var(--foreground)",
                            fontSize: "0.85rem",
                          }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>

              <div
                style={{
                  marginTop: "1.5rem",
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: "0.6rem",
                }}
              >
                <button
                  type="button"
                  onClick={() => setShowInsertModal(false)}
                  style={{
                    padding: "0.5rem 1rem",
                    borderRadius: 6,
                    background: "transparent",
                    border: "1px solid var(--border)",
                    color: "var(--foreground)",
                    fontSize: "0.85rem",
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={modalLoading}
                  style={{
                    padding: "0.5rem 1.25rem",
                    borderRadius: 6,
                    background: "var(--accent)",
                    color: "#fff",
                    border: "none",
                    fontSize: "0.85rem",
                    fontWeight: 700,
                    cursor: modalLoading ? "not-allowed" : "pointer",
                  }}
                >
                  {modalLoading ? "Saving..." : "Save Record"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: EDIT ROW ───────────────────────────────────────────── */}
      {showEditModal && editingRow && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
            padding: "1rem",
          }}
        >
          <div
            style={{
              background: "var(--card)",
              border: "1px solid var(--card-border)",
              borderRadius: "var(--radius)",
              width: "100%",
              maxWidth: 540,
              maxHeight: "90vh",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "1rem 1.25rem",
                borderBottom: "1px solid var(--border)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <h3 style={{ fontSize: "1.05rem", fontWeight: 700 }}>Edit Record in &quot;{selectedTable}&quot;</h3>
              <button
                onClick={() => setShowEditModal(false)}
                style={{ background: "transparent", border: "none", color: "var(--muted)", cursor: "pointer" }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} style={{ padding: "1.25rem", overflowY: "auto", flex: 1 }}>
              {modalError && (
                <div
                  style={{
                    padding: "0.75rem",
                    background: "rgba(239, 68, 68, 0.1)",
                    border: "1px solid rgba(239, 68, 68, 0.25)",
                    borderRadius: 4,
                    color: "#ef4444",
                    fontSize: "0.85rem",
                    marginBottom: "1rem",
                  }}
                >
                  {modalError}
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                {columns.map((col) => {
                  const isPk = col.is_primary_key;

                  return (
                    <div key={col.column_name}>
                      <label
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          fontSize: "0.85rem",
                          fontWeight: 600,
                          marginBottom: "0.3rem",
                        }}
                      >
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
                          {col.column_name}
                          {isPk && <Key size={12} style={{ color: "#f59e0b" }} />}
                          {!col.is_nullable && <span style={{ color: "#ef4444" }}>*</span>}
                        </span>
                        <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
                          {col.data_type} {isPk && "(Primary Key - read only)"}
                        </span>
                      </label>

                      <input
                        type="text"
                        disabled={isPk}
                        value={
                          typeof formData[col.column_name] === "object"
                            ? JSON.stringify(formData[col.column_name])
                            : formData[col.column_name] ?? ""
                        }
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, [col.column_name]: e.target.value }))
                        }
                        style={{
                          width: "100%",
                          padding: "0.55rem",
                          borderRadius: 6,
                          background: isPk ? "rgba(255,255,255,0.03)" : "var(--bg-inset)",
                          border: "1px solid var(--border)",
                          color: isPk ? "var(--muted)" : "var(--foreground)",
                          fontSize: "0.85rem",
                          cursor: isPk ? "not-allowed" : "text",
                        }}
                      />
                    </div>
                  );
                })}
              </div>

              <div
                style={{
                  marginTop: "1.5rem",
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: "0.6rem",
                }}
              >
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  style={{
                    padding: "0.5rem 1rem",
                    borderRadius: 6,
                    background: "transparent",
                    border: "1px solid var(--border)",
                    color: "var(--foreground)",
                    fontSize: "0.85rem",
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={modalLoading}
                  style={{
                    padding: "0.5rem 1.25rem",
                    borderRadius: 6,
                    background: "var(--accent)",
                    color: "#fff",
                    border: "none",
                    fontSize: "0.85rem",
                    fontWeight: 700,
                    cursor: modalLoading ? "not-allowed" : "pointer",
                  }}
                >
                  {modalLoading ? "Saving..." : "Update Record"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: CREATE TABLE DESIGNER ───────────────────────────────── */}
      {showCreateTableModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
            padding: "1rem",
          }}
        >
          <div
            style={{
              background: "var(--card)",
              border: "1px solid var(--card-border)",
              borderRadius: "var(--radius)",
              width: "100%",
              maxWidth: 680,
              maxHeight: "90vh",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "1rem 1.25rem",
                borderBottom: "1px solid var(--border)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <h3 style={{ fontSize: "1.05rem", fontWeight: 700 }}>Visual Table Designer</h3>
              <button
                onClick={() => setShowCreateTableModal(false)}
                style={{ background: "transparent", border: "none", color: "var(--muted)", cursor: "pointer" }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateTableSubmit} style={{ padding: "1.25rem", overflowY: "auto", flex: 1 }}>
              {modalError && (
                <div
                  style={{
                    padding: "0.75rem",
                    background: "rgba(239, 68, 68, 0.1)",
                    border: "1px solid rgba(239, 68, 68, 0.25)",
                    borderRadius: 4,
                    color: "#ef4444",
                    fontSize: "0.85rem",
                    marginBottom: "1rem",
                  }}
                >
                  {modalError}
                </div>
              )}

              {/* Table Name */}
              <div style={{ marginBottom: "1.25rem" }}>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.35rem" }}>
                  Table Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. orders, users, posts"
                  value={newTableName}
                  onChange={(e) => setNewTableName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))}
                  style={{
                    width: "100%",
                    padding: "0.55rem 0.75rem",
                    borderRadius: 6,
                    background: "var(--bg-inset)",
                    border: "1px solid var(--border)",
                    color: "var(--foreground)",
                    fontSize: "0.9rem",
                    fontWeight: 600,
                  }}
                  required
                />
              </div>

              {/* Columns Blueprint */}
              <div style={{ marginBottom: "1rem" }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "0.5rem",
                  }}
                >
                  <label style={{ fontSize: "0.85rem", fontWeight: 600 }}>Columns Blueprint</label>
                  <button
                    type="button"
                    onClick={() =>
                      setNewTableCols((prev) => [
                        ...prev,
                        { name: "", type: "VARCHAR(255)", isPrimaryKey: false, isNullable: true, defaultValue: "" },
                      ])
                    }
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      padding: "0.25rem 0.6rem",
                      borderRadius: 4,
                      background: "var(--bg-inset)",
                      border: "1px solid var(--border)",
                      color: "var(--foreground)",
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    <Plus size={12} /> Add Column
                  </button>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  {newTableCols.map((c, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 140px 80px 80px 32px",
                        gap: "0.5rem",
                        alignItems: "center",
                        padding: "0.45rem",
                        background: "var(--bg-inset)",
                        borderRadius: 6,
                        border: "1px solid var(--border)",
                      }}
                    >
                      <input
                        type="text"
                        placeholder="Column name"
                        value={c.name}
                        onChange={(e) => {
                          const val = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_");
                          setNewTableCols((prev) =>
                            prev.map((col, i) => (i === idx ? { ...col, name: val } : col))
                          );
                        }}
                        style={{
                          padding: "0.35rem 0.5rem",
                          background: "var(--card)",
                          border: "1px solid var(--border)",
                          borderRadius: 4,
                          fontSize: "0.8rem",
                          color: "var(--foreground)",
                        }}
                        required
                      />

                      <select
                        value={c.type}
                        onChange={(e) => {
                          const val = e.target.value;
                          setNewTableCols((prev) =>
                            prev.map((col, i) => (i === idx ? { ...col, type: val } : col))
                          );
                        }}
                        style={{
                          padding: "0.35rem 0.5rem",
                          background: "var(--card)",
                          border: "1px solid var(--border)",
                          borderRadius: 4,
                          fontSize: "0.78rem",
                          color: "var(--foreground)",
                        }}
                      >
                        <option value="SERIAL">SERIAL (PK)</option>
                        <option value="INTEGER">INTEGER</option>
                        <option value="BIGINT">BIGINT</option>
                        <option value="VARCHAR(255)">VARCHAR(255)</option>
                        <option value="TEXT">TEXT</option>
                        <option value="BOOLEAN">BOOLEAN</option>
                        <option value="TIMESTAMP">TIMESTAMP</option>
                        <option value="NUMERIC(10,2)">NUMERIC(10,2)</option>
                        <option value="JSONB">JSONB</option>
                        <option value="UUID">UUID</option>
                      </select>

                      <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "0.75rem", cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={c.isPrimaryKey}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setNewTableCols((prev) =>
                              prev.map((col, i) =>
                                i === idx
                                  ? { ...col, isPrimaryKey: checked, isNullable: checked ? false : col.isNullable }
                                  : col
                              )
                            );
                          }}
                        />
                        PK
                      </label>

                      <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "0.75rem", cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={!c.isNullable}
                          onChange={(e) => {
                            const notNull = e.target.checked;
                            setNewTableCols((prev) =>
                              prev.map((col, i) => (i === idx ? { ...col, isNullable: !notNull } : col))
                            );
                          }}
                        />
                        Req
                      </label>

                      <button
                        type="button"
                        onClick={() => setNewTableCols((prev) => prev.filter((_, i) => i !== idx))}
                        disabled={newTableCols.length <= 1}
                        style={{
                          background: "transparent",
                          border: "none",
                          color: newTableCols.length <= 1 ? "var(--muted)" : "#ef4444",
                          cursor: newTableCols.length <= 1 ? "not-allowed" : "pointer",
                          padding: 2,
                        }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div
                style={{
                  marginTop: "1.5rem",
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: "0.6rem",
                }}
              >
                <button
                  type="button"
                  onClick={() => setShowCreateTableModal(false)}
                  style={{
                    padding: "0.5rem 1rem",
                    borderRadius: 6,
                    background: "transparent",
                    border: "1px solid var(--border)",
                    color: "var(--foreground)",
                    fontSize: "0.85rem",
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={modalLoading}
                  style={{
                    padding: "0.5rem 1.25rem",
                    borderRadius: 6,
                    background: "var(--accent)",
                    color: "#fff",
                    border: "none",
                    fontSize: "0.85rem",
                    fontWeight: 700,
                    cursor: modalLoading ? "not-allowed" : "pointer",
                  }}
                >
                  {modalLoading ? "Creating..." : "Create Table"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
