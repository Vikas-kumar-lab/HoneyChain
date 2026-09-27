const RISK_THRESHOLD = parseInt(process.env.RISK_THRESHOLD) || 70;
const STAGE_GAP_DAYS = parseInt(process.env.TIME_GAP_WARNING) || 86400;

const flaggedProducts = new Map();
const supplierAnalytics = new Map();

class RiskAnalyzer {
  async analyzeProduct(batchId, productHistory) {
    const anomalies = [];
    let riskScore = 0;

    const timeGap = this.analyzeTimeGaps(productHistory);
    if (timeGap.anomalyDetected) { anomalies.push(timeGap); riskScore += 10; }

    const completeness = this.checkDataCompleteness(productHistory);
    if (completeness.anomalyDetected) { anomalies.push(completeness); riskScore += 15; }

    const health = this.analyzeHiveHealth(productHistory);
    if (health.anomalyDetected) { anomalies.push(health); riskScore += health.riskPenalty; }

    const dupes = this.checkDuplicates(productHistory);
    if (dupes.anomalyDetected) { anomalies.push(dupes); riskScore += 30; }

    riskScore = Math.min(riskScore, 100);
    const isFlagged = riskScore >= RISK_THRESHOLD;

    const result = {
      productId: batchId,
      riskScore,
      isFlagged,
      anomalies,
      recommendation: this.getRecommendation(riskScore),
      timestamp: new Date().toISOString(),
    };

    if (isFlagged) flaggedProducts.set(batchId, result);
    this.updateSupplierAnalytics(productHistory, isFlagged);

    return result;
  }

  analyzeHiveHealth(history) {
    const issues = [];
    let penalty = 0;

    for (const ev of history) {
      if (!ev.iotDataHash || ev.iotDataHash === 'Init' || ev.iotDataHash === 'N/A') continue;
      const h = ev.iotDataHash.toLowerCase();
      if (h.includes('disease') || h.includes('varroa')) {
        issues.push({ stage: this.stageName(ev.stage), issue: 'Signs of Varroa or disease in hive IoT data' });
        penalty += 40;
      }
      if (h.includes('high_temp') || h.includes('low_temp')) {
        issues.push({ stage: this.stageName(ev.stage), issue: 'Abnormal hive temperature reading' });
        penalty += 20;
      }
    }

    return {
      anomalyDetected: issues.length > 0,
      type: 'HIVE_HEALTH_ANOMALY',
      severity: penalty >= 40 ? 'HIGH' : 'MEDIUM',
      details: issues,
      description: 'IoT health anomaly detected',
      riskPenalty: penalty,
    };
  }

  analyzeTimeGaps(history) {
    if (history.length < 2) return { anomalyDetected: false };

    const gaps = [];
    for (let i = 1; i < history.length; i++) {
      const diff = history[i].timestamp - history[i - 1].timestamp;
      if (diff > STAGE_GAP_DAYS * 14) {
        gaps.push({
          from: this.stageName(history[i - 1].stage),
          to: this.stageName(history[i].stage),
          duration: `${Math.floor(diff / 86400)} days`,
          issue: 'Unusually long gap between stages',
        });
      }
    }

    return {
      anomalyDetected: gaps.length > 0,
      type: 'TIME_GAP_ANOMALY',
      severity: 'LOW',
      details: gaps,
      description: 'Suspicious stage transition delay',
    };
  }

  checkDataCompleteness(history) {
    const missing = history
      .filter(ev => !ev.timestamp || !ev.location || ev.stage === undefined)
      .map(ev => ({ stage: this.stageName(ev.stage), issue: 'Missing required fields' }));

    return {
      anomalyDetected: missing.length > 0,
      type: 'DATA_COMPLETENESS_ANOMALY',
      severity: 'LOW',
      details: missing,
      description: 'Incomplete event data',
    };
  }

  checkDuplicates(history) {
    const seen = new Set();
    const dupes = [];

    for (const ev of history) {
      const key = `${ev.stage}-${ev.timestamp}-${ev.actor}`;
      if (seen.has(key)) {
        dupes.push({
          stage: this.stageName(ev.stage),
          timestamp: new Date(ev.timestamp * 1000).toISOString(),
          issue: 'Duplicate event — possible counterfeit',
        });
      }
      seen.add(key);
    }

    return {
      anomalyDetected: dupes.length > 0,
      type: 'DUPLICATE_ANOMALY',
      severity: 'HIGH',
      details: dupes,
      description: 'Duplicate events detected',
    };
  }

  updateSupplierAnalytics(history, isFlagged) {
    for (const ev of history) {
      if (!supplierAnalytics.has(ev.actor)) {
        supplierAnalytics.set(ev.actor, { address: ev.actor, totalProducts: 0, flaggedProducts: 0, stages: [] });
      }
      const a = supplierAnalytics.get(ev.actor);
      a.totalProducts++;
      if (isFlagged) a.flaggedProducts++;
      if (!a.stages.includes(ev.stage)) a.stages.push(ev.stage);
    }
  }

  getRecommendation(score) {
    if (score >= 70) return 'HIGH RISK: Flag and investigate immediately';
    if (score >= 40) return 'MEDIUM RISK: Monitor closely, verify with beekeeper';
    return 'LOW RISK: Batch appears authentic';
  }

  stageName(stage) {
    return ['Init', 'Beekeeping', 'Processing', 'Distribution', 'Retail', 'Sold'][stage] || 'Unknown';
  }

  getFlaggedProducts() { return Array.from(flaggedProducts.values()); }
  getSupplierAnalytics(addr) { return supplierAnalytics.get(addr) || { address: addr, totalProducts: 0, flaggedProducts: 0, stages: [] }; }
  clearCache() { flaggedProducts.clear(); supplierAnalytics.clear(); }
}

module.exports = new RiskAnalyzer();
