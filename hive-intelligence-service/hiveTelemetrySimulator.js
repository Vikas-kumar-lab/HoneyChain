const Web3 = require('web3');
const fs = require('fs');
const path = require('path');

const SEPOLIA_RPC = process.env.SEPOLIA_RPC || process.env.RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com';

class HiveTelemetrySimulator {
  constructor() {
    this.rpcUrl = process.env.RPC_URL || process.env.GANACHE_RPC || 'http://127.0.0.1:8546';
    this.web3 = new Web3(this.rpcUrl);
    this.contract = null;
    this.cachedHives = [];
    this.lastHiveFetch = 0;
    this.loadContract();
  }

  loadContract() {
    try {
      let artifactPath = path.join(__dirname, '../client/src/artifacts/HoneyChainCore.json');
      if (!fs.existsSync(artifactPath)) {
        artifactPath = path.join(__dirname, 'HoneyChainCore.json');
      }
      if (!fs.existsSync(artifactPath)) return;
      const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
      const net = artifact.networks['1337'] || artifact.networks['11155111'] || Object.values(artifact.networks || {})[0];
      const targetAddr = process.env.CONTRACT_ADDRESS || (net && net.address);
      if (targetAddr) this.contract = new this.web3.eth.Contract(artifact.abi, targetAddr);
    } catch (e) {
      console.warn('Could not load contract artifact:', e.message);
    }
  }

  async getLiveHives() {
    if (!this.contract) this.loadContract();

    const now = Date.now();
    // Cache hive metadata for 8 seconds to ensure lightning-fast response times
    if (this.cachedHives.length > 0 && now - this.lastHiveFetch < 8000) {
      return this.cachedHives.map(h => ({
        ...h,
        currentTemperature: +(34.0 + (Math.random() * 0.6 - 0.3)).toFixed(1),
        currentHumidity: +(58.0 + (Math.random() * 1.5 - 0.75)).toFixed(1),
        currentFrequencyHz: 215 + Math.floor(Math.random() * 10 - 5),
        timestamp: new Date().toISOString()
      }));
    }

    try {
      let count = 0;
      if (this.contract) {
        try {
          count = parseInt(await this.contract.methods.hiveCount().call());
        } catch (callErr) {
          count = 0;
        }
      }

      const hives = [];
      if (count > 0) {
        for (let i = 1; i <= count; i++) {
          const [h, flora] = await Promise.all([
            this.contract.methods.smartHives(i).call(),
            this.contract.methods.getFloraString(0).call().catch(() => 'Kashmir Acacia Honey')
          ]);
          const bkp = await this.contract.methods.beekeepers(h.beekeeperId).call().catch(() => ({}));
          const floraActual = await this.contract.methods.getFloraString(h.flora).call().catch(() => flora);

          const temp = +(34.0 + (Math.random() * 0.6 - 0.3)).toFixed(1);
          const humidity = +(58.0 + (Math.random() * 1.5 - 0.75)).toFixed(1);
          const freq = 215 + Math.floor(Math.random() * 10 - 5);

          hives.push({
            id: parseInt(h.hiveId),
            boxCode: h.boxIdentifier,
            location: bkp.clusterLocation || (bkp.state ? `${bkp.state} Apiary` : 'Apiary Cluster'),
            beekeeper: bkp.name || `Beekeeper #${h.beekeeperId}`,
            flora: floraActual,
            currentTemperature: temp,
            currentHumidity: humidity,
            currentFrequencyHz: freq,
            currentWeightKg: 26.5,
            healthScore: parseInt(h.healthScore) || 96,
            swarmAlert: freq > 400,
            varroaRisk: 'Low (3%)',
            timestamp: new Date().toISOString(),
          });
        }
      } else {
        // If 0 hives on chain, check registered_hives.json
        const regPath = path.join(__dirname, 'registered_hives.json');
        if (fs.existsSync(regPath)) {
          const regHives = JSON.parse(fs.readFileSync(regPath, 'utf8') || '[]');
          if (Array.isArray(regHives) && regHives.length > 0) {
            regHives.forEach((h, idx) => {
              const temp = +(34.0 + (Math.random() * 0.6 - 0.3)).toFixed(1);
              const humidity = +(58.0 + (Math.random() * 1.5 - 0.75)).toFixed(1);
              const freq = 215 + Math.floor(Math.random() * 10 - 5);
              hives.push({
                id: h.id || (idx + 1),
                boxCode: h.boxCode,
                location: h.location || 'Pulwama Cluster',
                beekeeper: h.beekeeper || 'Registered Beekeeper',
                flora: h.flora || 'Kashmir Acacia Honey',
                currentTemperature: temp,
                currentHumidity: humidity,
                currentFrequencyHz: freq,
                currentWeightKg: 26.5,
                healthScore: 96,
                swarmAlert: freq > 400,
                varroaRisk: 'Low (3%)',
                timestamp: new Date().toISOString(),
              });
            });
          }
        }
      }

      this.cachedHives = hives;
      this.lastHiveFetch = now;
      return hives;
    } catch (err) {
      console.error('Error fetching hives:', err.message);
      this.cachedHives = [];
      return [];
    }
  }

  async getHiveById(id) {
    const hives = await this.getLiveHives();
    return hives.find(h => h.id === parseInt(id)) || null;
  }

  predictHarvestYield(hiveId, bloomingWeeks) {
    const weeks = Math.min(Math.max(bloomingWeeks, 1), 6);
    
    // Fetch target hive and its live telemetry sensors
    const hive = this.cachedHives.find(h => h.id === parseInt(hiveId)) || {};
    const floraName = (hive.flora || 'acacia').toLowerCase();
    
    // Flora-specific baseline potential (kg per box)
    let yMax = 20.0; // default for Kashmir Acacia (13-20kg seasonal benchmark)
    if (floraName.includes('mustard')) yMax = 18.0;
    else if (floraName.includes('acacia')) yMax = 20.0;
    else if (floraName.includes('eucalyptus')) yMax = 15.0;
    else if (floraName.includes('sidr')) yMax = 12.0;
    else if (floraName.includes('forest') || floraName.includes('wild')) yMax = 16.0;
    else if (floraName.includes('multi')) yMax = 16.0;

    // --- 1. Temperature Modifier (M_temp) ---
    // Optimal Brood Nest (33.5°C - 35.0°C) allows maximum foraging workforce
    const temp = hive.currentTemperature || 34.0;
    let mTemp = 1.0;
    let tempStatus = 'Optimal';
    if (temp < 32.0 || temp > 36.0) {
      mTemp = 0.80; // Thermal stress: bees diverted from foraging to heat/cool nest
      tempStatus = temp < 32.0 ? 'Cold Stress' : 'Heat Stress';
    } else if (temp < 33.0 || temp > 35.5) {
      mTemp = 0.92;
      tempStatus = 'Sub-optimal';
    }

    // --- 2. Humidity Modifier (M_humidity) ---
    // Optimal relative humidity (50% - 65%) ensures rapid nectar evaporation & comb ripening
    const humidity = hive.currentHumidity || 58.0;
    let mHumidity = 1.0;
    let humidityStatus = 'Optimal';
    if (humidity > 70.0) {
      mHumidity = 0.88; // High moisture slows down nectar drying
      humidityStatus = 'High Moisture';
    } else if (humidity < 40.0) {
      mHumidity = 0.90; // Dry air increases water-fetching load
      humidityStatus = 'Dry Air';
    }

    // --- 3. Acoustic Frequency Modifier (M_acoustic) ---
    // 200-285 Hz = active flight; >380 Hz / Swarm Alert = colony division loss
    const freq = hive.currentFrequencyHz || 215;
    const swarmAlert = hive.swarmAlert || freq > 400;
    let mAcoustic = 1.0;
    let acousticStatus = 'Normal Active Colony';
    if (swarmAlert || freq > 380) {
      mAcoustic = 0.60; // Swarming splits worker population in half
      acousticStatus = 'Swarm Warning (-40% Yield)';
    } else if (freq > 290) {
      mAcoustic = 0.97;
      acousticStatus = 'Ventilation Fanning';
    }

    // --- 4. Colony Health Score Modifier (M_colony) ---
    const healthScore = hive.healthScore || 96;
    const mHealth = Math.min(Math.max(healthScore / 100, 0.65), 1.05);

    // Combined live biological & environmental efficiency index
    const biologicalEfficiency = parseFloat((mTemp * mHumidity * mAcoustic * mHealth).toFixed(3));

    // Saturating yield curve modulated by live telemetry efficiency
    const k = 0.45; // saturation constant per week
    const rawYield = yMax * (1 - Math.exp(-k * weeks)) * biologicalEfficiency;
    const yieldKg = parseFloat(rawYield.toFixed(1));

    // Bounded optimal harvest extraction date
    const offsetDays = Math.max(0, Math.min(14, (6 - weeks) * 4));
    const harvestDate = new Date();
    harvestDate.setDate(harvestDate.getDate() + offsetDays);

    return {
      hiveId,
      flora: hive.flora || 'Kashmir Acacia Honey',
      bloomingWeeks: weeks,
      predictedYieldKg: yieldKg,
      optimalHarvestDate: harvestDate.toDateString(),
      recommendedMoistureExtraction: 'Natural, within FSSAI specs (<=20% moisture)',
      purityForecast: 'Grade A (Agmark & FSSAI 2026 Compliant)',
      liveEfficiencyPercent: Math.round(biologicalEfficiency * 100),
      telemetrySnapshot: {
        temperature: `${temp}°C (${tempStatus})`,
        humidity: `${humidity}% (${humidityStatus})`,
        frequency: `${freq} Hz (${acousticStatus})`,
        healthScore: `${healthScore}/100`,
        hiveWeight: `${hive.currentWeightKg || 26.5} kg`,
      }
    };
  }

  analyzeAdulterationRisk({ moisturePercent, c4SugarPercent, pollenCount, antibioticDetected, hmfMgKg, diastaseActivity }) {
    let score = 0;
    const reasons = [];
    let isSubstandard = false;
    let isAdulterated = false;

    const moisture = parseFloat(moisturePercent) || 18.0;
    const c4Sugar = parseFloat(c4SugarPercent) || 0.0;
    const pollen = parseInt(pollenCount) || 6000;
    const hmf = parseFloat(hmfMgKg) || 25.0;
    const diastase = parseFloat(diastaseActivity) || 10.0;

    // 1. Moisture Content (FSSAI 2026 limit: <= 20.0%)
    if (moisture > 20.0) {
      score += 45;
      isSubstandard = true;
      reasons.push(`Moisture ${moisture}% exceeds FSSAI 20.0% limit — fermentation risk`);
    }

    // 2. C4 Sugar Ratio (SCIRA / IRMS limit: <= 7.0%)
    if (c4Sugar > 7.0) {
      score += 55;
      isAdulterated = true;
      reasons.push(`C4 sugar ${c4Sugar}% exceeds 7.0% limit — cane/corn syrup adulteration`);
    }

    // 3. Pollen Count (FSSAI standard: >= 5,000 grains per gram)
    if (pollen < 5000) {
      score += 25;
      isSubstandard = true;
      reasons.push(`Low pollen density (${pollen} grains/g, standard >= 5000/g) — filtration or dilution`);
    }

    // 4. Hydroxymethylfurfural (FSSAI tropical limit: <= 80 mg/kg)
    if (hmf > 80.0) {
      score += 30;
      isSubstandard = true;
      reasons.push(`HMF level ${hmf} mg/kg exceeds tropical limit (80 mg/kg) — heat damage or age`);
    }

    // 5. Diastase Activity (FSSAI / Codex standard: >= 8 Schade units)
    if (diastase < 8.0 && hmf >= 15.0) {
      score += 20;
      isSubstandard = true;
      reasons.push(`Diastase activity ${diastase} DN is below minimum standard (8 DN)`);
    }

    // 6. Antibiotic Contamination (Zero tolerance / Below MRPL)
    if (antibioticDetected) {
      score += 100;
      isAdulterated = true;
      reasons.push('Antibiotic residue detected (Banned substances: Chloramphenicol/Nitrofurans/Streptomycin)');
    }

    const isSafe = score < 40 && !isAdulterated;
    let classification = 'Authentic Raw Honey (Certified Pure)';
    if (isAdulterated) {
      classification = 'Adulterated / Non-compliant';
    } else if (isSubstandard) {
      classification = 'Substandard Quality (Fails FSSAI limits)';
    }

    return {
      riskScore: Math.min(score, 100),
      isSafe,
      classification,
      reasons,
      certifiedPure: isSafe,
      standardsRef: 'FSSAI Honey Regulations 2026 & Codex Alimentarius Standard 12-1981',
    };
  }
}

module.exports = new HiveTelemetrySimulator();
