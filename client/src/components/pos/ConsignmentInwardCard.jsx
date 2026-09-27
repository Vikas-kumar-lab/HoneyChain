import React from 'react';
import { FiTruck, FiCheckCircle, FiAlertCircle, FiInbox, FiBox } from 'react-icons/fi';

export function ConsignmentInwardCard({
  incomingBatches = [],
  activeBatchId,
  onSelectBatch,
  inwardCodeInput,
  onInwardCodeChange,
  onInwardSingleBottle,
  onInwardAllBottles,
  inwardFeedback,
  loading = false,
  isRetailerOrAdmin = true
}) {
  if (incomingBatches.length === 0) {
    return (
      <div className="clean-card" style={{ textAlign: "center", padding: "28px 20px" }}>
        <div style={{ color: "var(--primary-honey)", marginBottom: "8px" }}>
          <FiTruck size={28} />
        </div>
        <h4 style={{ fontSize: "1.05rem", fontWeight: 700, margin: "0 0 4px", color: "var(--ink-900)" }}>
          No Pending Consignments
        </h4>
        <p style={{ color: "var(--ink-500)", fontSize: "0.82rem", margin: 0, maxWidth: "420px", marginInline: "auto" }}>
          All dispatched honey consignments have been inwarded into store shelf inventory. New dispatches from logistics fleets will appear here.
        </p>
      </div>
    );
  }

  const activeBatch = incomingBatches.find(b => String(b.batchId) === String(activeBatchId)) || incomingBatches[0];

  return (
    <div className="clean-card" style={{ marginBottom: "20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px", flexWrap: "wrap", gap: "10px" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <h4 style={{ fontSize: "1.12rem", fontWeight: 700, margin: 0, color: "var(--ink-900)" }}>
              <FiInbox style={{ verticalAlign: "middle", marginRight: "6px" }} />
              Incoming Consignment Inwarding Desk
            </h4>
            <span className="badge-pending">
              {incomingBatches.length} Consignment{incomingBatches.length > 1 ? 's' : ''} Awaiting
            </span>
          </div>
          <p style={{ color: "var(--ink-500)", fontSize: "0.80rem", margin: "2px 0 0" }}>
            Scan or enter the 8-character Cryptographic Security PIN printed on each physical jar to inward into active stock.
          </p>
        </div>

        {activeBatch && (
          <button
            onClick={() => onInwardAllBottles(activeBatch)}
            disabled={loading || !isRetailerOrAdmin}
            className="btn-primary"
            style={{ fontSize: "0.78rem", padding: "6px 14px", display: "inline-flex", alignItems: "center", gap: "6px" }}
          >
            {loading ? "Inwarding..." : <><FiBox size={14} /> Inward All {activeBatch.jarsTotal || 0} Jars</>}
          </button>
        )}
      </div>

      {/* Consignment Selector Tabs if multiple */}
      {incomingBatches.length > 1 && (
        <div style={{ display: "flex", gap: "8px", marginBottom: "14px", flexWrap: "wrap" }}>
          {incomingBatches.map(b => {
            const isSelected = String(b.batchId) === String(activeBatch?.batchId);
            return (
              <button
                key={b.batchId}
                onClick={() => onSelectBatch(b.batchId)}
                style={{
                  padding: "6px 12px",
                  borderRadius: "6px",
                  border: isSelected ? "1px solid var(--primary-honey)" : "1px solid #E2E8F0",
                  background: isSelected ? "var(--primary-honey-light)" : "#FFFFFF",
                  color: isSelected ? "var(--primary-honey-hover)" : "var(--ink-800)",
                  fontSize: "0.80rem",
                  fontWeight: 600,
                  cursor: "pointer"
                }}
              >
                Batch #{b.batchId} ({b.batchCode}) • {b.floraName || 'Honey'}
              </button>
            );
          })}
        </div>
      )}

      {/* Active Batch Summary & Quick Inward Bar */}
      {activeBatch && (
        <div style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: "8px", padding: "14px", marginBottom: "12px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px", marginBottom: "10px" }}>
            <div>
              <span style={{ fontSize: "0.74rem", fontWeight: 700, color: "var(--primary-honey-hover)", textTransform: "uppercase" }}>
                Active Consignment: {activeBatch.batchCode}
              </span>
              <div style={{ fontSize: "0.86rem", fontWeight: 700, color: "var(--ink-900)" }}>
                {activeBatch.floraName || "Kashmir Acacia Honey"} — {activeBatch.beekeeperName || "Certified Apiary"}
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <input
                type="text"
                className="form-control"
                style={{ width: "200px", padding: "6px 10px", fontSize: "0.82rem", textTransform: "uppercase" }}
                placeholder="Enter 8-digit PIN / Jar #"
                value={inwardCodeInput}
                onChange={(e) => onInwardCodeChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    onInwardSingleBottle(activeBatch, inwardCodeInput);
                  }
                }}
              />
              <button
                onClick={() => onInwardSingleBottle(activeBatch, inwardCodeInput)}
                disabled={loading || !inwardCodeInput.trim()}
                className="btn-primary"
                style={{ padding: "6px 12px", fontSize: "0.78rem" }}
              >
                Inward Bottle
              </button>
            </div>
          </div>

          {/* Feedback message */}
          {inwardFeedback && (
            <div style={{
              padding: "8px 12px",
              borderRadius: "6px",
              background: inwardFeedback.type === 'error' ? "#FEF2F2" : "#ECFDF5",
              border: `1px solid ${inwardFeedback.type === 'error' ? '#FCA5A5' : '#A7F3D0'}`,
              color: inwardFeedback.type === 'error' ? "#DC2626" : "#059669",
              fontSize: "0.78rem",
              display: "flex",
              alignItems: "center",
              gap: "8px"
            }}>
              {inwardFeedback.type === 'error' ? <FiAlertCircle size={14} /> : <FiCheckCircle size={14} />}
              <span>{inwardFeedback.message} {inwardFeedback.detail && `— ${inwardFeedback.detail}`}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default ConsignmentInwardCard;
