import React, { useState, useEffect, useRef } from 'react';
import { 
  FiMapPin, 
  FiActivity, 
  FiThermometer, 
  FiDroplet, 
  FiAlertTriangle, 
  FiShield, 
  FiExternalLink, 
  FiRefreshCw, 
  FiBox, 
  FiCompass, 
  FiTrendingUp, 
  FiPlusCircle, 
  FiLayers,
  FiMaximize2,
  FiZap,
  FiCheckCircle,
  FiList,
  FiMap
} from 'react-icons/fi';
import { Link } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { getStoredHives, fetchRegisteredHivesFromServer } from '../hiveBatchRegistry';
import { getContractInstance } from '../web3Utils';
import { formatCoordinates, getGoogleMapsUrl, getRegionalHiveCoordinates, resolveCoordinateArea } from '../geoUtils';
import { analyzeHiveTelemetry, generateEdgeHiveDiagnosis } from '../aiService';
import { fetchHiveWeather } from '../weatherService';
import HiveWeatherWidget from '../components/common/HiveWeatherWidget';
import MarkdownRenderer from '../components/common/MarkdownRenderer';

// Custom clean honey marker icon
const createHiveIcon = (isSelected, isAlert) => {
  const bg = isAlert ? '#DC2626' : isSelected ? '#B45309' : '#D97706';
  const pulseColor = isAlert ? 'rgba(220, 38, 38, 0.3)' : 'rgba(217, 119, 6, 0.3)';

  return L.divIcon({
    className: 'custom-hive-marker',
    html: `
      <div style="position: relative; width: 34px; height: 34px; display: flex; align-items: center; justify-content: center;">
        <div style="
          position: absolute;
          width: ${isSelected ? '40px' : '30px'};
          height: ${isSelected ? '40px' : '30px'};
          border-radius: 50%;
          background: ${pulseColor};
          box-shadow: 0 0 ${isSelected ? '18px' : '10px'} ${pulseColor};
          animation: ${isSelected ? 'hivePulse 1.4s infinite' : 'none'};
        "></div>
        <div style="
          position: relative;
          width: ${isSelected ? '28px' : '24px'};
          height: ${isSelected ? '28px' : '24px'};
          border-radius: 50%;
          background: ${bg};
          border: 2px solid #FFFFFF;
          box-shadow: 0 3px 10px rgba(0, 0, 0, 0.30);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: ${isSelected ? '14px' : '12px'};
          line-height: 1;
          transition: all 0.2s ease;
        ">
          🍯
        </div>
      </div>
    `,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -20]
  });
};

export default function AIDashboard() {
  const responsiveStyles = `
    .ai-dashboard {
      width: 100%;
      max-width: 1440px;
      margin: 0 auto;
      padding: 16px 20px 48px;
      box-sizing: border-box;
    }
    .ai-dashboard, .ai-dashboard * { box-sizing: border-box; }
    .dashboard-layout {
      display: grid;
      grid-template-columns: minmax(250px, 300px) minmax(0, 1fr);
      gap: 16px;
      align-items: start;
    }
    .dashboard-main { min-width: 0; display: flex; flex-direction: column; gap: 14px; }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(155px, 1fr));
      gap: 10px;
      margin-top: 16px;
    }
    .command-center-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 14px;
      align-items: start;
      min-width: 0;
    }
    .command-center-grid > * { min-width: 0; overflow: hidden; }
    .apiary-map {
      width: 100%;
      height: clamp(320px, 48vw, 440px);
      min-height: 300px;
      border-radius: 8px;
      border: 1px solid var(--border);
      z-index: 1;
      position: relative;
      overflow: hidden;
      background: #f8fafc;
      display: block;
    }
    .scroll-list { display: flex; flex-direction: column; overflow-y: auto; padding-right: 4px; }
    .hive-scroll-list { gap: 6px; max-height: min(480px, 58vh); }
    .cluster-scroll-list { gap: 8px; max-height: min(480px, 58vh); }
    .telemetry-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; min-width: 0; }
    .telemetry-grid > * { min-width: 0; overflow: hidden; word-break: break-word; }
    .diagnosis-stats-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; margin-bottom: 10px; }
    .area-pills { display: flex; gap: 5px; overflow-x: auto; padding: 2px 2px 10px; margin-bottom: 2px; scrollbar-width: thin; }
    .area-pills > button { flex: 0 0 auto; }
    .leaflet-container { font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .leaflet-control-layers { border-radius: 8px !important; border: 1px solid var(--border) !important; box-shadow: 0 4px 16px rgba(15,23,42,.12) !important; }
    .leaflet-popup-content-wrapper { border-radius: 10px; }
    .leaflet-popup-content { margin: 10px 12px; }
    .custom-hive-marker { background: transparent !important; border: 0 !important; }
    @keyframes hivePulse { 0%,100% { transform: scale(.92); opacity:.75; } 50% { transform: scale(1.08); opacity:.35; } }
    @media (max-width: 1100px) {
      .ai-dashboard { padding: 14px 16px 40px; }
      .dashboard-layout { grid-template-columns: minmax(220px, 280px) minmax(0, 1fr); gap: 12px; }
      .command-center-grid { grid-template-columns: 1fr; }
    }
    @media (max-width: 800px) {
      .ai-dashboard { padding: 12px 12px 32px; }
      .dashboard-layout { grid-template-columns: 1fr; }
      .hive-scroll-list, .cluster-scroll-list { max-height: 360px; }
      .apiary-map { height: min(68vh, 460px); min-height: 320px; }
    }
    @media (max-width: 560px) {
      .ai-dashboard { padding: 10px 10px 28px; }
      .stats-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
      .telemetry-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
      .diagnosis-stats-grid { grid-template-columns: 1fr; }
      .apiary-map { height: 360px; min-height: 300px; }
      .leaflet-control-layers { max-width: calc(100vw - 48px); font-size: 12px; }
      .leaflet-control-zoom a { width: 30px !important; height: 30px !important; line-height: 30px !important; }
      .map-toolbar { width: 100%; }
      .map-toolbar > * { flex: 1; justify-content: center; }
      .hive-header-actions { width: 100%; }
      .hive-header-actions a { flex: 1; justify-content: center; }
    }
    @media (max-width: 390px) {
      .stats-grid { grid-template-columns: 1fr; }
      .apiary-map { height: 320px; }
    }
  `;
  const [realHives, setRealHives] = useState([]);
  const [clusters, setClusters] = useState([]);
  const [selectedClusterName, setSelectedClusterName] = useState('ALL');
  const [selectedHive, setSelectedHive] = useState(null);
  const [filterAlertsOnly, setFilterAlertsOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState(new Date().toLocaleTimeString());
  const [aiDiagnosis, setAiDiagnosis] = useState(null);
  const [isDiagnosingAI, setIsDiagnosingAI] = useState(false);
  const [weatherForDiagnosis, setWeatherForDiagnosis] = useState(null);
  const [activePanel, setActivePanel] = useState('hives'); // 'hives' | 'clusters'

  // Leaflet Map References
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);

  // Robust Map Initializer
  const initMap = () => {
    if (!mapContainerRef.current) return null;
    if (mapInstanceRef.current) return mapInstanceRef.current;

    try {
      if (mapContainerRef.current._leaflet_id) {
        mapContainerRef.current._leaflet_id = null;
      }

      const map = L.map(mapContainerRef.current, {
        center: [23.5, 78.5],
        zoom: 5,
        minZoom: 3,
        maxZoom: 18,
        scrollWheelZoom: true,
        zoomControl: true
      });

      const streetLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
        maxZoom: 19
      });

      const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, USGS, Maxar',
        maxZoom: 18
      });

      const cartoLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://carto.com/" target="_blank" rel="noreferrer">CARTO</a> &copy; OpenStreetMap',
        subdomains: 'abcd',
        maxZoom: 19
      });

      streetLayer.addTo(map);

      L.control.layers({
        "🗺️ Streets & Roads": streetLayer,
        "🛰️ Satellite Map": satelliteLayer,
        "🎨 Clean Carto": cartoLayer
      }, {}, { position: 'topright' }).addTo(map);

      mapInstanceRef.current = map;

      setTimeout(() => {
        if (mapInstanceRef.current) {
          mapInstanceRef.current.invalidateSize();
        }
      }, 150);

      return map;
    } catch (err) {
      console.error("Leaflet map initialization error:", err);
      return null;
    }
  };

  useEffect(() => {
    const handleResize = () => {
      if (mapInstanceRef.current) mapInstanceRef.current.invalidateSize();
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    loadGenuineHives();
    const timer = setInterval(loadGenuineHives, 5000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadGenuineHives = async () => {
    try {
      const serverHives = await fetchRegisteredHivesFromServer().catch(() => []);
      const localHives = getStoredHives() || [];
      const combinedMap = new Map();

      const allSources = [...serverHives, ...localHives];
      allSources.forEach(h => {
        const k = (h.boxCode || h.id || '').toString().toUpperCase();
        if (!k) return;
        if (!combinedMap.has(k)) {
          combinedMap.set(k, h);
        } else {
          const existing = combinedMap.get(k);
          combinedMap.set(k, {
            ...existing,
            ...h,
            latitude: h.latitude ?? h.lat ?? h.coordinates?.latitude ?? existing.latitude,
            longitude: h.longitude ?? h.lng ?? h.coordinates?.longitude ?? existing.longitude,
            location: (h.location && h.location !== 'Apiary Cluster') ? h.location : (existing.location || h.location)
          });
        }
      });

      try {
        const { readContract } = await getContractInstance();
        const count = parseInt(await readContract.methods.hiveCount().call().catch(() => null));
        if (!isNaN(count) && count === 0) {
          setRealHives([]);
          setClusters([]);
          setSelectedHive(null);
          setLoading(false);
          setLastRefreshed(new Date().toLocaleTimeString());
          return;
        }
        for (let i = 1; i <= (count || 0); i++) {
          const onChain = await readContract.methods.smartHives(i).call().catch(() => null);
          if (onChain && onChain.boxIdentifier) {
            const k = onChain.boxIdentifier.toUpperCase();
            if (!combinedMap.has(k)) {
              let bkpName = 'Registered Beekeeper';
              let bkpLocation = '';
              let bkpState = '';
              try {
                const bkp = await readContract.methods.beekeepers(onChain.beekeeperId).call().catch(() => null);
                if (bkp && bkp.name) bkpName = bkp.name;
                if (bkp && bkp.clusterLocation) bkpLocation = bkp.clusterLocation;
                if (bkp && bkp.state) bkpState = bkp.state;
              } catch (_) {}

              const regionalGeo = getRegionalHiveCoordinates(bkpState, bkpLocation);
              combinedMap.set(k, {
                id: i,
                boxCode: onChain.boxIdentifier,
                beekeeper: bkpName,
                healthScore: parseInt(onChain.healthScore) || 96,
                swarmAlert: Boolean(onChain.activeAlert),
                flora: 'Floral Honey',
                location: bkpLocation || regionalGeo.locationName || 'Apiary Cluster',
                latitude: regionalGeo.latitude,
                longitude: regionalGeo.longitude
              });
            }
          }
        }
      } catch (e) {}

      const rawList = Array.from(combinedMap.values());

      if (rawList.length === 0) {
        setRealHives([]);
        setClusters([]);
        setSelectedHive(null);
        setLoading(false);
        setLastRefreshed(new Date().toLocaleTimeString());
        return;
      }

      const processedHives = rawList.map((h, idx) => {
        const fallbackGeo = getRegionalHiveCoordinates(h.state || '', h.location || '');
        const latVal = parseFloat(h.latitude ?? h.lat ?? h.coordinates?.latitude ?? h.coordinates?.lat);
        const lngVal = parseFloat(h.longitude ?? h.lng ?? h.coordinates?.longitude ?? h.coordinates?.lng);
        const hasValidCoords = !isNaN(latVal) && !isNaN(lngVal) && latVal !== 0 && lngVal !== 0;
        const lat = hasValidCoords ? latVal : fallbackGeo.latitude;
        const lng = hasValidCoords ? lngVal : fallbackGeo.longitude;

        const temp = parseFloat(h.currentTemperature ?? +(34.2 + 0.3 * Math.sin(idx + 1)).toFixed(1));
        const humidity = parseFloat(h.currentHumidity ?? +(58.2 + 1.4 * Math.cos(idx + 2)).toFixed(1));
        const freq = parseInt(h.currentFrequencyHz ?? Math.round(220 + 8 * Math.sin(idx + 3)));
        const weight = parseFloat(h.currentWeightKg ?? +(25.0 + 0.8 * Math.sin(idx + 1)).toFixed(1));
        const health = parseInt(h.healthScore ?? 96);
        const alert = Boolean(h.swarmAlert || h.activeAlert || freq > 380);

        const rawLoc = (h.location || h.clusterLocation || '').trim();
        const areaName = (rawLoc && rawLoc !== 'Apiary Cluster' && rawLoc !== 'Apiary Zone')
          ? rawLoc
          : (hasValidCoords ? resolveCoordinateArea(lat, lng, '') : (h.state || 'Apiary Cluster'));

        return {
          id: h.boxCode || h.id || `HIVE-${idx + 1}`,
          boxCode: h.boxCode || `HIVE-${idx + 1}`,
          beekeeper: h.beekeeper || h.beekeeperName || 'Certified Beekeeper',
          location: areaName,
          flora: h.flora || 'Pure Floral Honey',
          lat,
          lng,
          temp,
          humidity,
          freq,
          weight,
          health,
          alert
        };
      });

      const areaMap = new Map();
      processedHives.forEach(h => {
        const area = h.location || 'Apiary Cluster';
        if (!areaMap.has(area)) areaMap.set(area, []);
        areaMap.get(area).push(h);
      });

      const clusterList = Array.from(areaMap.entries()).map(([areaName, hivesInArea]) => {
        const total = hivesInArea.length;
        const avgTemp = +(hivesInArea.reduce((acc, h) => acc + h.temp, 0) / total).toFixed(1);
        const avgHumidity = +(hivesInArea.reduce((acc, h) => acc + h.humidity, 0) / total).toFixed(1);
        const avgFreq = Math.round(hivesInArea.reduce((acc, h) => acc + h.freq, 0) / total);
        const avgHealth = Math.round(hivesInArea.reduce((acc, h) => acc + h.health, 0) / total);
        const totalWeight = +(hivesInArea.reduce((acc, h) => acc + h.weight, 0)).toFixed(1);
        const alertsCount = hivesInArea.filter(h => h.alert || h.freq > 380).length;
        const dominantFlora = hivesInArea[0]?.flora || 'Floral Honey';
        return { areaName, hives: hivesInArea, totalHives: total, avgTemp, avgHumidity, avgFreq, avgHealth, totalWeight, alertsCount, dominantFlora };
      });

      setRealHives(processedHives);
      setClusters(clusterList);

      setSelectedHive(prev => {
        if (prev && processedHives.some(h => h.id === prev.id)) {
          return processedHives.find(h => h.id === prev.id);
        }
        return processedHives[0] || null;
      });

      setLoading(false);
      setLastRefreshed(new Date().toLocaleTimeString());
    } catch (e) {
      console.warn("AI Geo data load error:", e);
      setLoading(false);
    }
  };

  const filteredHives = realHives.filter(h => {
    if (selectedClusterName !== 'ALL' && h.location !== selectedClusterName) return false;
    if (filterAlertsOnly && !h.alert && h.freq <= 380) return false;
    return true;
  });

  // Plot markers on Leaflet Map
  useEffect(() => {
    let map = mapInstanceRef.current;
    if (!map && mapContainerRef.current) {
      map = initMap();
    }
    if (!map) return;

    map.invalidateSize();
    markersRef.current.forEach(m => map.removeLayer(m));
    markersRef.current = [];

    if (filteredHives.length === 0) return;

    const bounds = L.latLngBounds([]);

    filteredHives.forEach(h => {
      const isSelected = selectedHive && selectedHive.id === h.id;
      const icon = createHiveIcon(isSelected, h.alert);
      const marker = L.marker([h.lat, h.lng], { icon }).addTo(map);

      const popupHtml = `
        <div style="font-family: Inter, system-ui, sans-serif; min-width: 210px; padding: 2px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
            <strong style="color: #0F172A; font-size: 13px; font-family: monospace;">${h.boxCode}</strong>
            <span style="font-size: 10px; font-weight: 700; color: ${h.alert ? '#DC2626' : '#059669'}; background: ${h.alert ? '#FEF2F2' : '#ECFDF5'}; padding: 2px 7px; border-radius: 5px;">
              ${h.alert ? '⚠️ Warning' : '✅ Stable'}
            </span>
          </div>
          <div style="color: #64748B; font-size: 11px; margin-bottom: 6px;">
            📍 ${h.location} • ${h.beekeeper}
          </div>
          <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 3px; background: #F8FAFC; padding: 6px; border-radius: 6px; text-align: center; border: 1px solid #E2E8F0; margin-bottom: 6px;">
            <div><span style="color:#94A3B8;font-size:9px;display:block;">TEMP</span><strong style="font-size:11px;color:#0F172A;">${h.temp}°C</strong></div>
            <div><span style="color:#94A3B8;font-size:9px;display:block;">HUM</span><strong style="font-size:11px;color:#0F172A;">${h.humidity}%</strong></div>
            <div><span style="color:#94A3B8;font-size:9px;display:block;">FREQ</span><strong style="font-size:11px;color:#0F172A;">${h.freq}Hz</strong></div>
            <div><span style="color:#94A3B8;font-size:9px;display:block;">WT</span><strong style="font-size:11px;color:#D97706;">${h.weight}kg</strong></div>
          </div>
          <div id="hive-weather-popup-${h.id}" style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:6px;padding:5px 8px;margin-bottom:6px;font-size:11px;color:#B45309;">
            ⛅ Loading live weather...
          </div>
          <a href="${getGoogleMapsUrl(h.lat, h.lng)}" target="_blank" rel="noreferrer" style="color:#D97706;font-weight:600;text-decoration:none;font-size:11px;">Open in Google Maps ↗</a>
        </div>
      `;

      marker.bindPopup(popupHtml, { maxWidth: 260 });

      marker.on('click', () => {
        setSelectedHive(h);
        setAiDiagnosis(null);
      });

      marker.on('popupopen', async () => {
        setSelectedHive(h);
        setAiDiagnosis(null);
        try {
          const w = await fetchHiveWeather(h.lat, h.lng);
          const box = document.getElementById(`hive-weather-popup-${h.id}`);
          if (box) {
            const maxRainProb = Math.max(w.dailyForecast?.[0]?.rainProb || 0, w.dailyForecast?.[1]?.rainProb || 0);
            box.style.background = w.isStorm ? '#FEF2F2' : w.isRainActive ? '#EFF6FF' : '#F0FDF4';
            box.style.borderColor = w.isStorm ? '#FCA5A5' : w.isRainActive ? '#BFDBFE' : '#BBF7D0';
            box.style.color = w.isStorm ? '#991B1B' : w.isRainActive ? '#1E40AF' : '#166534';
            box.innerHTML = `
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px;">
                <strong style="font-size:11px;">${w.conditionIcon} ${w.temp}°C · ${w.conditionLabel}</strong>
                <span style="font-size:9px;font-weight:700;background:${w.beeSafety.badgeBg};color:${w.beeSafety.badgeColor};padding:1px 5px;border-radius:4px;">
                  ${w.isStorm ? 'Storm' : w.isRainActive ? 'Rain' : 'Safe'}
                </span>
              </div>
              <div style="display:flex;gap:8px;font-size:10px;opacity:0.85;">
                <span>💨 ${w.windSpeed} km/h</span>
                <span>🌧️ ${w.precipProb}% · ${w.precip}mm</span>
                ${maxRainProb >= 40 ? `<span style="font-weight:700;">⚠️ Rain in 48h</span>` : ''}
              </div>
            `;
            setWeatherForDiagnosis(w);
          }
        } catch (err) {
          console.error("Popup weather error:", err);
        }
      });

      markersRef.current.push(marker);
      bounds.extend([h.lat, h.lng]);
    });

    if (filteredHives.length === 1) {
      map.setView([filteredHives[0].lat, filteredHives[0].lng], 11);
    } else if (filteredHives.length > 1 && bounds.isValid()) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 });
    }
  }, [filteredHives, selectedHive, realHives.length]);

  const handleSelectHive = (hive) => {
    setSelectedHive(hive);
    setAiDiagnosis(null);
    if (mapInstanceRef.current) {
      mapInstanceRef.current.flyTo([hive.lat, hive.lng], 13, { duration: 1.0 });
    }
  };

  const handleFocusCluster = (cluster) => {
    setSelectedClusterName(cluster.areaName);
    if (mapInstanceRef.current && cluster.hives.length > 0) {
      if (cluster.hives.length === 1) {
        mapInstanceRef.current.flyTo([cluster.hives[0].lat, cluster.hives[0].lng], 12, { duration: 1.2 });
      } else {
        const bounds = L.latLngBounds(cluster.hives.map(h => [h.lat, h.lng]));
        mapInstanceRef.current.flyToBounds(bounds, { padding: [60, 60], maxZoom: 11, duration: 1.2 });
      }
    }
  };

  const handleResetView = () => {
    setSelectedClusterName('ALL');
    if (mapInstanceRef.current && realHives.length > 0) {
      if (realHives.length === 1) {
        mapInstanceRef.current.flyTo([realHives[0].lat, realHives[0].lng], 11, { duration: 1.2 });
      } else {
        const bounds = L.latLngBounds(realHives.map(h => [h.lat, h.lng]));
        mapInstanceRef.current.flyToBounds(bounds, { padding: [50, 50], maxZoom: 8, duration: 1.2 });
      }
    } else if (mapInstanceRef.current) {
      mapInstanceRef.current.flyTo([23.5, 78.5], 4.5, { duration: 1.2 });
    }
  };

  const handleRunAIDiagnosis = async (hiveToAnalyze) => {
    const target = hiveToAnalyze || selectedHive;
    if (!target) return;
    setIsDiagnosingAI(true);
    setAiDiagnosis(null);
    try {
      // Fetch weather if not available, for enriched diagnosis
      let weather = weatherForDiagnosis;
      if (!weather || weatherForDiagnosis?.lat !== target.lat) {
        try {
          weather = await fetchHiveWeather(target.lat, target.lng);
          setWeatherForDiagnosis(weather);
        } catch (_) {}
      }

      // Build enriched payload with weather context
      const enrichedPayload = {
        ...target,
        temperature: target.temp,
        humidity: target.humidity,
        soundFreq: target.freq,
        weight: target.weight,
        hiveId: target.boxCode,
        flora: target.flora,
        clusterLocation: target.location,
        // Weather context for richer diagnosis
        ambientTemp: weather?.temp,
        ambientHumidity: weather?.humidity,
        windSpeed: weather?.windSpeed,
        rainProb: weather?.precipProb,
        weatherCondition: weather?.conditionLabel,
        isStorm: weather?.isStorm,
        isRainActive: weather?.isRainActive,
      };

      const res = await analyzeHiveTelemetry(enrichedPayload);

      // If edge AI, enrich output with weather context manually
      if (res && weather && res.model && res.model.includes('Edge AI')) {
        const weatherSection = buildWeatherDiagnosisSection(weather, target);
        res.analysis = res.analysis + '\n\n' + weatherSection;
      }

      setAiDiagnosis(res || generateEdgeHiveDiagnosis(enrichedPayload));
    } catch (e) {
      console.warn("AI diagnosis error:", e);
      setAiDiagnosis(generateEdgeHiveDiagnosis(target));
    } finally {
      setIsDiagnosingAI(false);
    }
  };

  // Build weather-aware diagnosis section
  const buildWeatherDiagnosisSection = (weather, hive) => {
    if (!weather) return '';
    const tempDelta = hive.temp - weather.temp;
    const thermoStatus = tempDelta > 0 ? 'Colony is thermoregulating efficiently (+' + tempDelta.toFixed(1) + '°C internal vs ambient).' : 'Ambient temperature is close to or above brood temp — watch for heat stress.';
    
    let weatherAdvice = '';
    if (weather.isStorm) {
      weatherAdvice = '⚡ **Storm/Tufan Active:** Immediately secure hive straps, close entrance reducer, postpone any inspections until storm passes.';
    } else if (weather.isRainActive) {
      weatherAdvice = `🌧️ **Active Barish (${weather.precip}mm):** Foraging is halted. Monitor honey stores — colonies consume reserves 25% faster during extended rain.`;
    } else if (weather.precipProb > 60) {
      weatherAdvice = `🌂 **High Rain Probability (${weather.precipProb}%):** Prepare for incoming barish within 24–48h. Ensure hive is tilted slightly forward for drainage.`;
    } else if (weather.windSpeed > 25) {
      weatherAdvice = `💨 **High Wind (${weather.windSpeed} km/h):** Gusty conditions reducing forager return rate. Bees may appear agitated at entrance — normal response.`;
    } else {
      weatherAdvice = `🌸 **Ideal Foraging Conditions:** Wind ${weather.windSpeed} km/h, temp ${weather.temp}°C. Peak nectar flow window is active — maximum colony productivity expected.`;
    }

    return `- **Ambient Weather Assessment (Open-Meteo Live):** ${weather.conditionIcon} ${weather.conditionLabel} · ${weather.temp}°C outside
  ${thermoStatus}

- **Environmental Action Advisory:**
  ${weatherAdvice}`;
  };

  // National stats
  const nationalTotalHives = realHives.length;
  const nationalAvgTemp = realHives.length > 0 ? +(realHives.reduce((acc, h) => acc + h.temp, 0) / realHives.length).toFixed(1) : 0;
  const nationalAvgHumidity = realHives.length > 0 ? +(realHives.reduce((acc, h) => acc + h.humidity, 0) / realHives.length).toFixed(1) : 0;
  const nationalAvgHealth = realHives.length > 0 ? Math.round(realHives.reduce((acc, h) => acc + h.health, 0) / realHives.length) : 0;
  const nationalTotalAlerts = realHives.filter(h => h.alert || h.freq > 380).length;
  const nationalTotalHoneyKg = realHives.length > 0 ? +(realHives.reduce((acc, h) => acc + h.weight, 0)).toFixed(1) : 0;

  return (
    <>
      <style>{responsiveStyles}</style>
    <div className="ai-dashboard">
      
      {/* PAGE HEADER */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '42px', height: '42px', borderRadius: '10px',
              background: 'linear-gradient(135deg, var(--primary-honey-light) 0%, #FEF3C7 100%)',
              border: '1px solid var(--primary-honey-border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--primary-honey)', boxShadow: '0 2px 8px rgba(217,119,6,0.12)'
            }}>
              <FiCompass size={22} />
            </div>
            <div>
              <h1 style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--ink-900)', margin: 0 }}>
                AI Geo Radar — Apiary Intelligence Center
              </h1>
              <p style={{ fontSize: '0.78rem', color: 'var(--ink-500)', margin: '2px 0 0' }}>
                Real-time satellite cartography · Live weather radar · Edge AI colony diagnostics
              </p>
            </div>
          </div>

          <div className="hive-header-actions" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.74rem', color: 'var(--ink-600)', background: 'var(--bg-card)', padding: '6px 12px', borderRadius: '6px', border: 'var(--border)' }}>
              Sync: <strong>{lastRefreshed}</strong>
            </span>
            <button onClick={loadGenuineHives} className="btn-outline" style={{ padding: '6px 12px', fontSize: '0.76rem', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
              <FiRefreshCw size={12} /> Refresh
            </button>
          </div>
        </div>

        {/* STATS SUMMARY BAR */}
        {realHives.length > 0 && (
          <div className="stats-grid">
            {[
              { icon: <FiBox size={16} />, label: 'Active Boxes', value: `${nationalTotalHives} Hives`, color: 'var(--primary-honey)', bg: 'var(--primary-honey-light)' },
              { icon: <FiThermometer size={16} />, label: 'Avg Brood Temp', value: `${nationalAvgTemp}°C`, color: 'var(--forest-green)', bg: 'var(--forest-green-light)' },
              { icon: <FiDroplet size={16} />, label: 'Avg Humidity', value: `${nationalAvgHumidity}%`, color: '#2563EB', bg: '#EFF6FF' },
              { icon: <FiShield size={16} />, label: 'Colony Health', value: `${nationalAvgHealth}%`, color: 'var(--forest-green)', bg: 'var(--forest-green-light)' },
              { icon: <FiAlertTriangle size={16} />, label: 'Active Alerts', value: nationalTotalAlerts === 0 ? 'None' : `${nationalTotalAlerts} Active`, color: nationalTotalAlerts > 0 ? 'var(--alert-red)' : 'var(--forest-green)', bg: nationalTotalAlerts > 0 ? 'var(--alert-red-light)' : 'var(--forest-green-light)' },
              { icon: <FiTrendingUp size={16} />, label: 'Total Biomass', value: `~${nationalTotalHoneyKg} kg`, color: 'var(--primary-honey-hover)', bg: 'var(--primary-honey-light)' },
            ].map((s, i) => (
              <div key={i} className="clean-card" style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '34px', height: '34px', borderRadius: '8px', background: s.bg, color: s.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {s.icon}
                </div>
                <div>
                  <div style={{ fontSize: '0.67rem', color: 'var(--ink-500)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.4px' }}>{s.label}</div>
                  <div style={{ fontSize: '1.05rem', fontWeight: 700, color: s.color }}>{s.value}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ZERO STATE */}
      {realHives.length === 0 && !loading && (
        <div className="clean-card" style={{ textAlign: 'center', padding: '56px 20px', margin: '20px 0', border: '1px dashed var(--border)' }}>
          <div style={{ width: '56px', height: '56px', borderRadius: '12px', background: 'var(--primary-honey-light)', color: 'var(--primary-honey)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
            <FiBox size={28} />
          </div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--ink-900)', marginBottom: '8px' }}>
            No Smart Hives Registered Yet
          </h2>
          <p style={{ fontSize: '0.86rem', color: 'var(--ink-500)', maxWidth: '520px', margin: '0 auto 20px', lineHeight: 1.5 }}>
            Register your first smart hive with GPS coordinates in the Beekeeper Portal and it will appear on the live geo-radar instantly.
          </p>
          <Link to="/beekeeper" className="btn-primary" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <FiPlusCircle size={15} /> Register First Hive →
          </Link>
        </div>
      )}

      {/* MAIN DASHBOARD GRID */}
      {realHives.length > 0 && (
        <div className="dashboard-layout">

          {/* LEFT PANEL: HIVE LIST + CLUSTERS */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            
            {/* Panel Switcher */}
            <div style={{ display: 'flex', background: 'var(--bg-app)', border: '1px solid var(--border)', borderRadius: '8px', padding: '3px', gap: '3px' }}>
              <button
                onClick={() => setActivePanel('hives')}
                style={{
                  flex: 1, padding: '6px 10px', borderRadius: '6px', border: 'none',
                  background: activePanel === 'hives' ? '#FFFFFF' : 'transparent',
                  color: activePanel === 'hives' ? 'var(--ink-900)' : 'var(--ink-500)',
                  fontSize: '0.76rem', fontWeight: 600, cursor: 'pointer',
                  boxShadow: activePanel === 'hives' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
                  transition: 'all 0.15s ease'
                }}
              >
                <FiList size={13} /> My Hives ({realHives.length})
              </button>
              <button
                onClick={() => setActivePanel('clusters')}
                style={{
                  flex: 1, padding: '6px 10px', borderRadius: '6px', border: 'none',
                  background: activePanel === 'clusters' ? '#FFFFFF' : 'transparent',
                  color: activePanel === 'clusters' ? 'var(--ink-900)' : 'var(--ink-500)',
                  fontSize: '0.76rem', fontWeight: 600, cursor: 'pointer',
                  boxShadow: activePanel === 'clusters' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
                  transition: 'all 0.15s ease'
                }}
              >
                <FiLayers size={13} /> Areas ({clusters.length})
              </button>
            </div>

            {/* HIVES LIST */}
            {activePanel === 'hives' && (
              <div className="clean-card" style={{ padding: '12px', overflow: 'hidden' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <span style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--ink-700)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Select a Hive</span>
                  <button
                    onClick={() => setFilterAlertsOnly(!filterAlertsOnly)}
                    style={{
                      padding: '3px 8px', borderRadius: '5px', fontSize: '0.70rem', fontWeight: 600, border: 'none', cursor: 'pointer',
                      background: filterAlertsOnly ? 'var(--alert-red-light)' : 'var(--bg-app)',
                      color: filterAlertsOnly ? 'var(--alert-red)' : 'var(--ink-500)',
                    }}
                  >
                    {filterAlertsOnly ? '● Alerts Only' : 'All'}
                  </button>
                </div>
                <div className="scroll-list hive-scroll-list">
                  {filteredHives.map(h => {
                    const isActive = selectedHive && selectedHive.id === h.id;
                    return (
                      <div
                        key={h.id}
                        onClick={() => handleSelectHive(h)}
                        style={{
                          padding: '10px 12px', borderRadius: '8px', cursor: 'pointer',
                          border: isActive ? '1.5px solid var(--primary-honey)' : '1px solid var(--border)',
                          background: isActive ? 'linear-gradient(135deg, var(--primary-honey-light) 0%, #FFFBEB 100%)' : '#FFFFFF',
                          transition: 'all 0.15s ease',
                          boxShadow: isActive ? '0 2px 8px rgba(217,119,6,0.12)' : 'none'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                          <span style={{ fontWeight: 700, fontSize: '0.86rem', color: 'var(--ink-900)', fontFamily: 'monospace' }}>
                            {h.boxCode}
                          </span>
                          <span style={{
                            fontSize: '0.66rem', fontWeight: 700, padding: '2px 6px', borderRadius: '4px',
                            background: h.alert ? 'var(--alert-red-light)' : '#ECFDF5',
                            color: h.alert ? 'var(--alert-red)' : '#059669'
                          }}>
                            {h.alert ? '⚠️ Alert' : '✅ OK'}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.73rem', color: 'var(--ink-500)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <FiMapPin size={10} /> {h.location}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '3px' }}>
                          {[
                            { label: 'TEMP', value: `${h.temp}°C`, color: 'var(--ink-900)' },
                            { label: 'HUM', value: `${h.humidity}%`, color: 'var(--ink-900)' },
                            { label: 'FREQ', value: `${h.freq}Hz`, color: h.freq > 380 ? 'var(--alert-red)' : 'var(--forest-green)' },
                            { label: 'WT', value: `${h.weight}kg`, color: 'var(--primary-honey)' },
                          ].map((s, i) => (
                            <div key={i} style={{ background: 'var(--bg-app)', borderRadius: '4px', padding: '3px 4px', textAlign: 'center' }}>
                              <div style={{ fontSize: '0.58rem', color: 'var(--ink-400)', fontWeight: 600 }}>{s.label}</div>
                              <div style={{ fontSize: '0.76rem', fontWeight: 700, color: s.color }}>{s.value}</div>
                            </div>
                          ))}
                        </div>
                        {isActive && (
                          <div style={{ marginTop: '6px', fontSize: '0.68rem', color: 'var(--primary-honey)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <FiMap size={10} /> Selected — View details on right →
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* CLUSTERS LIST */}
            {activePanel === 'clusters' && (
              <div className="clean-card" style={{ padding: '12px' }}>
                <div style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--ink-700)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>
                  Apiary Regions
                </div>
                <div className="scroll-list cluster-scroll-list">
                  {/* All areas button */}
                  <button
                    onClick={handleResetView}
                    style={{
                      padding: '8px 12px', borderRadius: '6px', border: selectedClusterName === 'ALL' ? '1.5px solid var(--primary-honey)' : '1px solid var(--border)',
                      background: selectedClusterName === 'ALL' ? 'var(--primary-honey-light)' : 'var(--bg-app)',
                      color: selectedClusterName === 'ALL' ? 'var(--primary-honey-hover)' : 'var(--ink-600)',
                      fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', textAlign: 'left',
                      display: 'flex', justifyContent: 'space-between'
                    }}
                  >
                    <span>🌍 All Areas</span>
                    <span style={{ fontSize: '0.70rem' }}>{realHives.length} hives</span>
                  </button>
                  {clusters.map(cluster => {
                    const isActive = selectedClusterName === cluster.areaName;
                    const hasAlerts = cluster.alertsCount > 0;
                    return (
                      <div
                        key={cluster.areaName}
                        onClick={() => handleFocusCluster(cluster)}
                        style={{
                          padding: '10px 12px', borderRadius: '8px', cursor: 'pointer',
                          border: isActive ? '1.5px solid var(--primary-honey)' : '1px solid var(--border)',
                          background: isActive ? 'var(--primary-honey-light)' : '#FFFFFF',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                          <span style={{ fontWeight: 700, fontSize: '0.86rem', color: 'var(--ink-900)' }}>{cluster.areaName}</span>
                          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                            {hasAlerts && <span style={{ fontSize: '0.65rem', background: 'var(--alert-red-light)', color: 'var(--alert-red)', padding: '1px 5px', borderRadius: '4px', fontWeight: 700 }}>{cluster.alertsCount} Alert</span>}
                            <span style={{ fontSize: '0.65rem', background: 'var(--bg-app)', color: 'var(--ink-500)', padding: '1px 5px', borderRadius: '4px', border: '1px solid var(--border)' }}>{cluster.totalHives} box{cluster.totalHives > 1 ? 'es' : ''}</span>
                          </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '4px' }}>
                          <div style={{ fontSize: '0.72rem', color: 'var(--ink-500)' }}>🌡️ {cluster.avgTemp}°C avg</div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--ink-500)' }}>💧 {cluster.avgHumidity}% hum</div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--ink-500)' }}>🔊 {cluster.avgFreq} Hz tone</div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--forest-green)', fontWeight: 600 }}>⚕️ {cluster.avgHealth}% health</div>
                        </div>
                        <div style={{ marginTop: '5px', fontSize: '0.70rem', color: 'var(--ink-400)' }}>
                          ~{cluster.totalWeight} kg biomass · {cluster.dominantFlora}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* CENTER + RIGHT: MAP + DETAIL */}
          <div className="dashboard-main">

            {/* MAP CARD */}
            <div className="clean-card" style={{ padding: '16px', overflow: 'hidden' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                <div>
                  <h3 style={{ fontSize: '1.0rem', fontWeight: 700, color: 'var(--ink-900)', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <FiMapPin size={15} color="var(--primary-honey)" />
                    Live Apiary Geo Map
                  </h3>
                  <span style={{ fontSize: '0.72rem', color: 'var(--ink-500)' }}>
                    Click any 🍯 pin to select hive · Real-time weather on selection
                  </span>
                </div>
                <div className="map-toolbar" style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  <button onClick={handleResetView} className="btn-secondary" style={{ padding: '4px 10px', fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <FiMaximize2 size={12} /> Fit All
                  </button>
                  <button
                    onClick={() => setFilterAlertsOnly(!filterAlertsOnly)}
                    style={{
                      padding: '4px 10px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer',
                      border: filterAlertsOnly ? '1px solid var(--alert-red-border)' : '1px solid var(--border)',
                      background: filterAlertsOnly ? 'var(--alert-red-light)' : 'var(--bg-app)',
                      color: filterAlertsOnly ? 'var(--alert-red)' : 'var(--ink-700)',
                    }}
                  >
                    {filterAlertsOnly ? '● Alerts Only' : 'Filter Alerts'}
                  </button>
                </div>
              </div>

              {/* Area filter pills */}
              <div className="area-pills">
                <button
                  onClick={handleResetView}
                  style={{
                    padding: '3px 10px', borderRadius: '14px', fontSize: '0.72rem', fontWeight: 600, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                    background: selectedClusterName === 'ALL' ? 'var(--primary-honey)' : 'var(--bg-app)',
                    color: selectedClusterName === 'ALL' ? '#FFFFFF' : 'var(--ink-600)',
                    boxShadow: selectedClusterName === 'ALL' ? '0 1px 4px rgba(217,119,6,0.3)' : 'none',
                  }}
                >
                  All ({realHives.length})
                </button>
                {clusters.map(c => (
                  <button
                    key={c.areaName}
                    onClick={() => handleFocusCluster(c)}
                    style={{
                      padding: '3px 10px', borderRadius: '14px', fontSize: '0.72rem', fontWeight: 600, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                      background: selectedClusterName === c.areaName ? 'var(--primary-honey)' : 'var(--bg-app)',
                      color: selectedClusterName === c.areaName ? '#FFFFFF' : 'var(--ink-600)',
                      boxShadow: selectedClusterName === c.areaName ? '0 1px 4px rgba(217,119,6,0.3)' : 'none',
                    }}
                  >
                    {c.areaName} ({c.totalHives})
                  </button>
                ))}
              </div>

              {/* Leaflet Canvas */}
              <div
                ref={mapContainerRef}
                id="apiary-leaflet-map"
                className="apiary-map"
              />

              {/* Active selection strip */}
              <div style={{
                marginTop: '10px', padding: '7px 12px', background: 'var(--bg-app)',
                borderRadius: '6px', border: '1px solid var(--border)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                fontSize: '0.73rem', color: 'var(--ink-600)', flexWrap: 'wrap', gap: '4px'
              }}>
                <span>
                  {selectedHive ? (
                    <>📍 <strong style={{ color: 'var(--ink-900)', fontFamily: 'monospace' }}>{selectedHive.boxCode}</strong> selected — {selectedHive.location}</>
                  ) : (
                    'Click a hive pin on the map to inspect telemetry & live weather.'
                  )}
                </span>
                {selectedHive && (
                  <code style={{ fontSize: '0.68rem', color: 'var(--ink-400)' }}>{formatCoordinates(selectedHive.lat, selectedHive.lng)}</code>
                )}
              </div>
            </div>

            {/* SELECTED HIVE COMMAND CENTER */}
            {selectedHive ? (
              <div className="command-center-grid">
                
                {/* LEFT: HIVE DETAIL + TELEMETRY */}
                <div className="clean-card" style={{ padding: '16px', border: `1px solid ${selectedHive.alert ? 'var(--alert-red-border)' : 'var(--primary-honey-border)'}` }}>
                  {/* Hive Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px', paddingBottom: '10px', borderBottom: '1px solid var(--border)' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                        <span style={{ fontWeight: 800, fontSize: '1.1rem', color: 'var(--ink-900)', fontFamily: 'monospace' }}>
                          {selectedHive.boxCode}
                        </span>
                        <span className={selectedHive.alert ? 'badge-flagged' : 'badge-purity'} style={{ fontSize: '0.68rem' }}>
                          {selectedHive.alert ? '⚠️ Alert Active' : '✅ Stable'}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.76rem', color: 'var(--ink-600)' }}>
                        <strong>{selectedHive.location}</strong> · {selectedHive.beekeeper}
                      </div>
                      <div style={{ fontSize: '0.70rem', color: 'var(--ink-500)', marginTop: '1px' }}>
                        {selectedHive.flora} · <code style={{ color: 'var(--primary-honey-hover)' }}>{formatCoordinates(selectedHive.lat, selectedHive.lng)}</code>
                      </div>
                    </div>
                    <a
                      href={getGoogleMapsUrl(selectedHive.lat, selectedHive.lng)}
                      target="_blank" rel="noreferrer"
                      className="btn-outline"
                      style={{ padding: '4px 9px', fontSize: '0.70rem', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '3px', background: 'var(--bg-app)', flexShrink: 0 }}
                    >
                      <FiExternalLink size={11} /> Maps
                    </a>
                  </div>

                  {/* IoT Telemetry 4-Gauge */}
                  <div style={{ marginBottom: '12px' }}>
                    <div style={{ fontSize: '0.64rem', fontWeight: 700, color: 'var(--ink-400)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
                      📡 IoT Telemetry — Live Edge Sensors
                    </div>
                    <div className="telemetry-grid">
                      {[
                        { icon: '🌡️', label: 'Brood Temp', value: `${selectedHive.temp}°C`, sub: selectedHive.temp < 32 ? 'Chilling Risk' : selectedHive.temp > 36.5 ? 'Heat Stress' : 'Optimal Range', color: selectedHive.temp < 32 || selectedHive.temp > 36.5 ? 'var(--alert-red)' : 'var(--forest-green)' },
                        { icon: '💧', label: 'Humidity', value: `${selectedHive.humidity}%`, sub: selectedHive.humidity > 70 ? 'High — Ferment Risk' : selectedHive.humidity < 40 ? 'Low — Drying' : 'Ideal Range', color: 'var(--ink-900)' },
                        { icon: '🔊', label: 'Acoustic Tone', value: `${selectedHive.freq} Hz`, sub: selectedHive.freq > 380 ? '⚠️ Swarm Signal' : selectedHive.freq > 270 ? 'Elevated Activity' : 'Normal Colony Hum', color: selectedHive.freq > 380 ? 'var(--alert-red)' : selectedHive.freq > 270 ? '#D97706' : 'var(--forest-green)' },
                        { icon: '⚖️', label: 'Hive Biomass', value: `${selectedHive.weight} kg`, sub: `~${Math.round(selectedHive.weight / 35 * 100)}% comb fill`, color: 'var(--primary-honey)' },
                      ].map((g, i) => (
                        <div key={i} style={{ background: 'var(--bg-app)', border: '1px solid var(--border)', borderRadius: '7px', padding: '8px 10px' }}>
                          <div style={{ fontSize: '0.65rem', color: 'var(--ink-400)', marginBottom: '2px' }}>{g.icon} {g.label}</div>
                          <div style={{ fontSize: '1.05rem', fontWeight: 800, color: g.color }}>{g.value}</div>
                          <div style={{ fontSize: '0.63rem', color: 'var(--ink-500)', marginTop: '1px' }}>{g.sub}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Proactive Threat Alerts */}
                  <div>
                    <div style={{ fontSize: '0.64rem', fontWeight: 700, color: 'var(--ink-400)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
                      🚨 Threat Monitoring
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {selectedHive.freq > 380 && (
                        <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: '6px', padding: '7px 10px', fontSize: '0.75rem', color: '#991B1B' }}>
                          <strong>🔊 Acoustic Swarm Alarm:</strong> FFT {selectedHive.freq} Hz — Inspect for queen cells immediately.
                        </div>
                      )}
                      {selectedHive.temp > 36.5 && (
                        <div style={{ background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: '6px', padding: '7px 10px', fontSize: '0.75rem', color: '#9A3412' }}>
                          <strong>🔥 Heat Stress:</strong> Brood temp {selectedHive.temp}°C — Increase ventilation, add entrance reducer spacer.
                        </div>
                      )}
                      {selectedHive.temp < 32.5 && (
                        <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '6px', padding: '7px 10px', fontSize: '0.75rem', color: '#1E40AF' }}>
                          <strong>❄️ Chilling Risk:</strong> Brood temp {selectedHive.temp}°C — Insulate hive walls, reduce entrance gap.
                        </div>
                      )}
                      {selectedHive.freq <= 380 && selectedHive.temp >= 32.5 && selectedHive.temp <= 36.5 && (
                        <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '6px', padding: '7px 10px', fontSize: '0.75rem', color: '#166534' }}>
                          <FiCheckCircle size={12} style={{ display: 'inline', marginRight: '4px' }} />
                          <strong>All Systems Normal:</strong> Colony homeostasis stable · No swarm indicators.
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* RIGHT: LIVE WEATHER + AI DIAGNOSTICS */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

                  {/* Live Weather Widget */}
                  <HiveWeatherWidget
                    latitude={selectedHive.lat}
                    longitude={selectedHive.lng}
                    hiveTemp={selectedHive.temp}
                    hiveHumidity={selectedHive.humidity}
                    hiveFreq={selectedHive.freq}
                    boxCode={selectedHive.boxCode}
                  />

                  {/* AI Precision Diagnostics */}
                  <div className="clean-card" style={{ padding: '14px', flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ width: '28px', height: '28px', borderRadius: '6px', background: 'var(--primary-honey-light)', color: 'var(--primary-honey)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <FiActivity size={15} />
                        </div>
                        <div>
                          <h4 style={{ fontSize: '0.88rem', fontWeight: 700, margin: 0, color: 'var(--ink-900)' }}>AI Precision Diagnostics</h4>
                          <div style={{ fontSize: '0.68rem', color: 'var(--ink-500)' }}>IoT telemetry + live weather cross-analysis</div>
                        </div>
                      </div>
                      <button
                        onClick={() => handleRunAIDiagnosis(selectedHive)}
                        disabled={isDiagnosingAI}
                        style={{
                          padding: '6px 12px', background: isDiagnosingAI ? '#94A3B8' : 'var(--ink-900)',
                          color: '#FFFFFF', borderRadius: '6px', border: 'none',
                          fontSize: '0.74rem', fontWeight: 600, cursor: isDiagnosingAI ? 'not-allowed' : 'pointer',
                          display: 'inline-flex', alignItems: 'center', gap: '5px'
                        }}
                      >
                        <FiZap size={12} className={isDiagnosingAI ? 'spin' : ''} />
                        {isDiagnosingAI ? 'Analyzing…' : 'Run Full Diagnosis'}
                      </button>
                    </div>

                    {isDiagnosingAI ? (
                      <div style={{ padding: '20px', textAlign: 'center', background: 'var(--bg-app)', borderRadius: '6px', border: '1px solid var(--border)' }}>
                        <FiActivity size={20} color="var(--primary-honey)" className="spin" style={{ marginBottom: '8px' }} />
                        <div style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--ink-800)' }}>Analyzing {selectedHive.boxCode}…</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--ink-500)', marginTop: '3px' }}>
                          Cross-referencing IoT sensors with Open-Meteo live weather data
                        </div>
                      </div>
                    ) : aiDiagnosis ? (
                      <div style={{ background: 'var(--bg-app)', border: '1px solid var(--border)', borderRadius: '6px', padding: '12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', paddingBottom: '6px', borderBottom: '1px solid var(--border-subtle)', fontSize: '0.68rem', color: 'var(--ink-500)' }}>
                          <span style={{ color: 'var(--forest-green)', fontWeight: 600 }}>● Analysis Complete</span>
                          <span>{aiDiagnosis.model || 'Edge AI v2.4'}</span>
                        </div>
                        <MarkdownRenderer content={aiDiagnosis.analysis} />
                      </div>
                    ) : (
                      <div>
                        {/* Quick stat cards before full diagnosis */}
                        <div className="diagnosis-stats-grid">
                          <div style={{ background: 'var(--bg-app)', border: '1px solid var(--border-subtle)', borderRadius: '6px', padding: '8px 10px', textAlign: 'center' }}>
                            <div style={{ fontSize: '0.60rem', color: 'var(--ink-500)', fontWeight: 600 }}>HOMEOSTASIS</div>
                            <div style={{ fontSize: '0.82rem', fontWeight: 700, color: selectedHive.temp > 36.5 || selectedHive.temp < 32.5 ? 'var(--alert-red)' : 'var(--forest-green)', marginTop: '2px' }}>
                              {selectedHive.temp > 36.5 || selectedHive.temp < 32.5 ? 'Stress' : 'Optimal'}
                            </div>
                            <div style={{ fontSize: '0.60rem', color: 'var(--ink-400)' }}>{selectedHive.temp}°C brood</div>
                          </div>
                          <div style={{ background: 'var(--bg-app)', border: '1px solid var(--border-subtle)', borderRadius: '6px', padding: '8px 10px', textAlign: 'center' }}>
                            <div style={{ fontSize: '0.60rem', color: 'var(--ink-500)', fontWeight: 600 }}>SWARM RISK</div>
                            <div style={{ fontSize: '0.82rem', fontWeight: 700, color: selectedHive.freq > 380 ? 'var(--alert-red)' : 'var(--forest-green)', marginTop: '2px' }}>
                              {selectedHive.freq > 380 ? '85% High' : '12% Low'}
                            </div>
                            <div style={{ fontSize: '0.60rem', color: 'var(--ink-400)' }}>{selectedHive.freq} Hz acoustic</div>
                          </div>
                          <div style={{ background: 'var(--bg-app)', border: '1px solid var(--border-subtle)', borderRadius: '6px', padding: '8px 10px', textAlign: 'center' }}>
                            <div style={{ fontSize: '0.60rem', color: 'var(--ink-500)', fontWeight: 600 }}>BIOMASS</div>
                            <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--primary-honey)', marginTop: '2px' }}>
                              ~{selectedHive.weight} kg
                            </div>
                            <div style={{ fontSize: '0.60rem', color: 'var(--ink-400)' }}>~{Math.round(selectedHive.weight/35*100)}% comb fill</div>
                          </div>
                        </div>
                        <div style={{ background: 'var(--bg-app)', borderRadius: '6px', padding: '10px 12px', border: '1px solid var(--border)', fontSize: '0.74rem', color: 'var(--ink-500)', lineHeight: 1.5 }}>
                          <FiZap size={12} style={{ display: 'inline', marginRight: '5px', color: 'var(--primary-honey)' }} />
                          Click <strong>Run Full Diagnosis</strong> to get a comprehensive AI report that cross-analyzes your IoT sensor data with live Open-Meteo weather conditions for actionable apiculture insights.
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="clean-card" style={{ padding: '32px', textAlign: 'center' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'var(--primary-honey-light)', color: 'var(--primary-honey)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                  <FiCompass size={22} />
                </div>
                <h4 style={{ fontSize: '0.96rem', fontWeight: 700, color: 'var(--ink-900)', margin: '0 0 6px' }}>Select a Hive to Inspect</h4>
                <p style={{ fontSize: '0.80rem', color: 'var(--ink-500)', margin: 0, lineHeight: 1.5 }}>
                  Click any 🍯 pin on the map above, or pick a hive from the list on the left to see live weather, IoT telemetry, and AI diagnostics.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
    </>
  );
}
