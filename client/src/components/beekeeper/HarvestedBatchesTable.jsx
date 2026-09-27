import React from 'react';
import { FiCheckCircle } from 'react-icons/fi';

export function HarvestedBatchesTable({ batches = [] }) {
  const sortedBatches = [...batches].sort((a, b) => (parseInt(a.batchId) || 0) - (parseInt(b.batchId) || 0));

  return (
    <div className="clean-card">
      <h4
        style={{ fontSize: "1.15rem", fontWeight: 700, marginBottom: "12px", color: "var(--ink-900)" }}
      >
        Harvested Batches on Blockchain
      </h4>
      <div className="table-responsive">
        <table className="honey-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Batch Code</th>
              <th>Beekeeper</th>
              <th>Flora</th>
              <th>Harvest Date</th>
              <th>Yield</th>
              <th>Current Stage</th>
              <th>Certification</th>
            </tr>
          </thead>
          <tbody>
            {sortedBatches.length === 0 ? (
              <tr>
                <td
                  colSpan="8"
                  style={{
                    textAlign: "center",
                    padding: "24px",
                    color: "var(--ink-400)",
                  }}
                >
                  No batches harvested yet. Register a hive and log your first
                  honey batch above!
                </td>
              </tr>
            ) : (
              sortedBatches.map((b, idx) => (
                <tr key={b.batchId || idx}>
                  <td>
                    <strong>#{b.batchId}</strong>
                  </td>
                  <td>
                    <code
                      style={{
                        background: "var(--bg-subtle)",
                        color: "var(--ink-700)",
                        padding: "2px 6px",
                        borderRadius: "4px",
                        fontSize: "0.8rem",
                      }}
                    >
                      {b.batchCode}
                    </code>
                  </td>
                  <td>{b.beekeeperName || 'Registered Beekeeper'}</td>
                  <td>
                    <span className="badge-purity">{b.floraName || 'Floral Honey'}</span>
                  </td>
                  <td style={{ color: "var(--ink-500)" }}>
                    {b.harvestTimestamp ? new Date(
                      parseInt(b.harvestTimestamp) * 1000,
                    ).toLocaleDateString() : 'Recent'}
                  </td>
                  <td>
                    <strong>{b.yieldWeightKg} kg</strong>
                  </td>
                  <td>
                    <strong>{b.currentStage || b.stageName || 'Harvested'}</strong>
                  </td>
                  <td>
                    {b.isCertifiedPure ? (
                      <span className="badge-purity"><FiCheckCircle size={11} /> Certified Pure</span>
                    ) : (
                      <span className="badge-pending">
                        Awaiting Lab
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default HarvestedBatchesTable;
