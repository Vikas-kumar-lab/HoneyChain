import React from 'react';
import { 
  FiCheckCircle, 
  FiAlertCircle
} from 'react-icons/fi';

export function BatchCustodyCard({
  batch,
  onOpenActionModal,
  userRoleTypes = [],
  isAdmin = false
}) {
  const stageIdx = batch.stage !== undefined ? parseInt(batch.stage) : (batch.stageIdx || 0);

  const getStageActionConfig = () => {
    switch (stageIdx) {
      case 0: // Harvested
        return {
          label: 'Awaiting Lab Testing',
          actionText: 'Enter Lab Portal',
          roleRequired: 'LAB',
          path: '/lab-testing',
          color: '#0369A1'
        };
      case 1: // QualityTested
        return {
          label: 'Ready for Processing',
          actionText: 'Process & Microfilter',
          roleRequired: 'PROCESSOR',
          stageKey: 'PROCESS',
          color: '#7E22CE'
        };
      case 2: // Processed
        return {
          label: 'Processed — Ready for Fleet',
          actionText: 'Dispatch via Logistics',
          roleRequired: 'DISTRIBUTOR',
          stageKey: 'DISPATCH',
          color: '#0891B2'
        };
      case 3: // Distributed
        return {
          label: 'In Transit — Ready to Stock',
          actionText: 'Stock at Retail Store',
          roleRequired: 'RETAILER',
          stageKey: 'STOCK',
          color: '#0F766E'
        };
      case 4: // Retail
      case 5: // Sold
        return {
          label: 'Stocked on Retail Shelf',
          actionText: 'Sell in Retail POS',
          roleRequired: 'RETAILER',
          path: '/retail',
          color: '#059669'
        };
      default:
        return null;
    }
  };

  const actionCfg = getStageActionConfig();
  const canPerformAction = actionCfg && (isAdmin || userRoleTypes.includes(actionCfg.roleRequired));

  return (
    <div className="clean-card" style={{
      marginBottom: "14px",
      borderLeft: `4px solid ${actionCfg?.color || 'var(--primary-honey)'}`,
      transition: "all 0.15s ease"
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
            <span style={{ fontSize: "1.05rem", fontWeight: 700, color: "var(--ink-900)" }}>
              Batch #{batch.batchId}
            </span>
            <code style={{ background: "var(--bg-subtle)", color: "var(--ink-700)", padding: "2px 6px", borderRadius: "4px", fontSize: "0.80rem" }}>
              {batch.batchCode}
            </code>
            {batch.isCertifiedPure && (
              <span className="badge-purity">
                <FiCheckCircle size={11} /> Certified Pure
              </span>
            )}
            {batch.isFlagged && (
              <span className="badge-flagged">
                <FiAlertCircle size={11} /> Flagged
              </span>
            )}
          </div>

          <div style={{ fontSize: "0.82rem", color: "var(--ink-600)", display: "flex", gap: "12px", flexWrap: "wrap", marginTop: "4px" }}>
            <span><strong>Flora:</strong> {batch.floraName || "Floral Honey"}</span>
            <span><strong>Yield:</strong> {batch.yieldWeightKg || 25} kg</span>
            <span><strong>Origin:</strong> {batch.clusterLocation || batch.beekeeperName || "Apiary"}</span>
            {batch.targetDestination && (
              <span><strong>Assigned:</strong> {batch.targetDestination}</span>
            )}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {actionCfg && (
            <button
              onClick={() => onOpenActionModal(batch, actionCfg)}
              disabled={!canPerformAction}
              className="btn-primary"
              style={{
                fontSize: "0.78rem",
                padding: "6px 14px",
                background: canPerformAction ? actionCfg.color : "#94A3B8",
                borderColor: canPerformAction ? actionCfg.color : "#94A3B8",
                opacity: canPerformAction ? 1 : 0.6,
                cursor: canPerformAction ? "pointer" : "not-allowed"
              }}
              title={!canPerformAction ? `Requires ${actionCfg.roleRequired} or Admin role` : actionCfg.actionText}
            >
              {actionCfg.actionText}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default BatchCustodyCard;
