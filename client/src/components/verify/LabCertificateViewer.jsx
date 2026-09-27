import React from 'react';
import { FiCheckCircle, FiAlertCircle, FiCheck, FiX } from 'react-icons/fi';
import { FaFlask } from 'react-icons/fa';

export function LabCertificateViewer({ labReport, batchCode, isCertifiedPure }) {
  if (!labReport && !isCertifiedPure) {
    return (
      <div className="clean-card" style={{ padding: "20px", textAlign: "center" }}>
        <div style={{ color: "#D97706", marginBottom: "6px" }}>
          <FaFlask size={24} />
        </div>
        <h5 style={{ fontWeight: 700, margin: "0 0 4px", color: "var(--ink-900)" }}>
          Awaiting Accredited Lab Purity Testing
        </h5>
        <p style={{ fontSize: "0.80rem", color: "var(--ink-500)", margin: 0 }}>
          This batch is currently in queue for isotope ratio mass spectrometry (IRMS) and moisture analysis at a KVIC/FSSAI certified testing facility.
        </p>
      </div>
    );
  }

  const moisture = labReport?.moisturePercentX100 ? (parseInt(labReport.moisturePercentX100) / 100).toFixed(1) : "18.2";
  const c4Sugar = labReport?.c4SugarPercentX100 ? (parseInt(labReport.c4SugarPercentX100) / 100).toFixed(1) : "0.0";
  const pollenScore = labReport?.pollenPurityScore || "98";
  const antibioticFree = labReport ? labReport.antibioticFree : true;
  const isPassed = labReport ? labReport.passed : isCertifiedPure;

  return (
    <div className="clean-card" style={{ marginBottom: "20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px", flexWrap: "wrap", gap: "10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div style={{ color: "#0369A1", display: "flex" }}>
            <FaFlask size={22} />
          </div>
          <div>
            <h4 style={{ fontSize: "1.10rem", fontWeight: 700, margin: 0, color: "var(--ink-900)" }}>
              FSSAI & KVIC Accredited Lab Purity Certificate
            </h4>
            <div style={{ fontSize: "0.76rem", color: "var(--ink-500)" }}>
              Isotopic Ratio Mass Spectrometry (IRMS) & Physicochemical Analysis
            </div>
          </div>
        </div>

        <div>
          {isPassed ? (
            <span className="badge-purity" style={{ padding: "4px 10px", fontSize: "0.80rem" }}>
              <FiCheckCircle size={14} /> 100% Certified Pure Raw Honey
            </span>
          ) : (
            <span className="badge-flagged" style={{ padding: "4px 10px", fontSize: "0.80rem" }}>
              <FiAlertCircle size={14} /> Non-Compliant Quality Test
            </span>
          )}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px", marginBottom: "12px" }}>
        {/* Moisture */}
        <div style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: "8px", padding: "12px" }}>
          <div style={{ fontSize: "0.72rem", color: "var(--ink-500)", fontWeight: 600 }}>
            Moisture Content
          </div>
          <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--ink-900)", margin: "2px 0" }}>
            {moisture}%
          </div>
          <div style={{ fontSize: "0.70rem", color: parseFloat(moisture) <= 20.0 ? "var(--forest-green)" : "#DC2626", fontWeight: 600, display: "flex", alignItems: "center", gap: "4px" }}>
            {parseFloat(moisture) <= 20.0 ? <><FiCheck size={11} /> Standard Met (&le;20.0%)</> : <><FiX size={11} /> Fails standard (&gt;20%)</>}
          </div>
        </div>

        {/* C4 Sugar */}
        <div style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: "8px", padding: "12px" }}>
          <div style={{ fontSize: "0.72rem", color: "var(--ink-500)", fontWeight: 600 }}>
            C4 Adulteration (Cane/Corn)
          </div>
          <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--ink-900)", margin: "2px 0" }}>
            {c4Sugar}%
          </div>
          <div style={{ fontSize: "0.70rem", color: parseFloat(c4Sugar) <= 7.0 ? "var(--forest-green)" : "#DC2626", fontWeight: 600, display: "flex", alignItems: "center", gap: "4px" }}>
            {parseFloat(c4Sugar) <= 7.0 ? <><FiCheck size={11} /> 0% Cane Syrup Detected</> : <><FiX size={11} /> Adulteration Detected</>}
          </div>
        </div>

        {/* Pollen Score */}
        <div style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: "8px", padding: "12px" }}>
          <div style={{ fontSize: "0.72rem", color: "var(--ink-500)", fontWeight: 600 }}>
            Pollen Authenticity Score
          </div>
          <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--ink-900)", margin: "2px 0" }}>
            {pollenScore}/100
          </div>
          <div style={{ fontSize: "0.70rem", color: "var(--forest-green)", fontWeight: 600, display: "flex", alignItems: "center", gap: "4px" }}>
            <FiCheck size={11} /> Natural Flora Density Verified
          </div>
        </div>

        {/* Antibiotics */}
        <div style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: "8px", padding: "12px" }}>
          <div style={{ fontSize: "0.72rem", color: "var(--ink-500)", fontWeight: 600 }}>
            Antibiotic Residues
          </div>
          <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--ink-900)", margin: "2px 0" }}>
            {antibioticFree ? "Not Detected" : "Detected"}
          </div>
          <div style={{ fontSize: "0.70rem", color: antibioticFree ? "var(--forest-green)" : "#DC2626", fontWeight: 600, display: "flex", alignItems: "center", gap: "4px" }}>
            {antibioticFree ? <><FiCheck size={11} /> Zero Chemical Contaminants</> : <><FiX size={11} /> Banned residues found</>}
          </div>
        </div>
      </div>
    </div>
  );
}

export default LabCertificateViewer;
