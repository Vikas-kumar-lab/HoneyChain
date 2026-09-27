import React, { useState, useEffect, useCallback } from "react";
import {
  FiCloudRain,
  FiWind,
  FiThermometer,
  FiDroplet,
  FiAlertTriangle,
  FiCheckCircle,
  FiRefreshCw,
  FiCalendar,
  FiClock,
  FiAlertCircle,
  FiChevronDown,
  FiChevronUp
} from "react-icons/fi";
import { fetchHiveWeather, generateHiveThreatAlerts } from "../../weatherService";

const HiveWeatherWidget = ({
  latitude,
  longitude,
  hiveTemp,
  hiveHumidity,
  hiveFreq,
  boxCode = "Selected Hive",
  variant = "card",
  className = "",
  style = {}
}) => {
  const [weather, setWeather] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForecastTimeline, setShowForecastTimeline] = useState(false);

  const loadWeather = useCallback(async () => {
    if (!latitude || !longitude) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await fetchHiveWeather(latitude, longitude);
      setWeather(data);
    } catch (err) {
      console.error("Failed to load hive weather:", err);
      setError("Unable to retrieve live meteorological radar");
    } finally {
      setLoading(false);
    }
  }, [latitude, longitude]);

  useEffect(() => {
    loadWeather();
  }, [loadWeather]);

  if (loading) {
    return (
      <div
        style={{
          background: "#FFFFFF",
          border: "1px solid var(--border)",
          borderRadius: "8px",
          padding: "12px 14px",
          display: "flex",
          alignItems: "center",
          gap: "10px",
          fontSize: "0.80rem",
          color: "var(--ink-500)",
          ...style
        }}
      >
        <FiRefreshCw className="spin" size={15} style={{ color: "var(--primary-honey)" }} />
        <span>Scanning live Open-Meteo storm radar & barish forecast for {boxCode}...</span>
      </div>
    );
  }

  if (error && !weather) {
    return (
      <div
        style={{
          background: "#FEF2F2",
          border: "1px solid #FCA5A5",
          borderRadius: "8px",
          padding: "10px 14px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: "0.80rem",
          color: "#991B1B",
          ...style
        }}
      >
        <span>⚠️ {error}</span>
        <button
          onClick={loadWeather}
          style={{
            background: "#FFFFFF",
            border: "1px solid #F87171",
            color: "#991B1B",
            borderRadius: "4px",
            padding: "3px 8px",
            cursor: "pointer",
            fontSize: "0.72rem",
            fontWeight: 600
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  if (!weather) {
    return null;
  }

  const { beeSafety, upcomingHourly = [], dailyForecast = [] } = weather;

  // Generate real-time alerts combining weather + hive telemetry
  const alerts = generateHiveThreatAlerts(weather, {
    temp: hiveTemp,
    humidity: hiveHumidity,
    freq: hiveFreq
  });

  // Check if any critical/warning alert exists
  const hasCriticalAlert = alerts.some(a => a.severity === "critical");
  const hasWarningAlert = alerts.some(a => a.severity === "warning" || a.severity === "danger");

  // Compact Variant (e.g. for mini displays)
  if (variant === "compact") {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "4px 6px",
          background: "#F8FAFC",
          borderRadius: "6px",
          border: "1px solid #E2E8F0",
          fontSize: "11px"
        }}
      >
        <span style={{ fontSize: "16px" }}>{weather.conditionIcon}</span>
        <div>
          <strong style={{ color: "#0F172A" }}>{weather.temp}°C</strong>
          <span style={{ color: "#64748B", marginLeft: "4px" }}>{weather.conditionLabel}</span>
          <div style={{ color: hasCriticalAlert ? "#DC2626" : hasWarningAlert ? "#EA580C" : "#059669", fontWeight: 600, fontSize: "10px" }}>
            {hasCriticalAlert ? "⚡ Threat Warning" : hasWarningAlert ? "🌧️ Weather Alert" : `💨 ${weather.windSpeed} km/h • ${weather.precipProb}% Rain`}
          </div>
        </div>
      </div>
    );
  }

  // Full Weather & Threat Radar Card Variant
  return (
    <div
      className={`hive-weather-card ${className}`}
      style={{
        background: hasCriticalAlert ? "#FEF2F2" : hasWarningAlert ? "#FFFBEB" : "#FFFFFF",
        border: `1px solid ${hasCriticalAlert ? "#FCA5A5" : hasWarningAlert ? "#FDE68A" : "var(--border)"}`,
        borderRadius: "8px",
        padding: "14px 16px",
        marginTop: "0px",
        transition: "all 0.2s ease",
        minWidth: 0,
        overflow: "hidden",
        ...style
      }}
    >
      {/* Header bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          flexWrap: "wrap",
          gap: "8px",
          marginBottom: "10px",
          borderBottom: "1px solid rgba(0,0,0,0.06)",
          paddingBottom: "8px"
        }}
      >
        {/* Left: icon + title + GPS */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: "8px", minWidth: 0, flex: "1 1 180px" }}>
          <span style={{ fontSize: "1.3rem", flexShrink: 0 }}>{weather.conditionIcon}</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
              <strong style={{ fontSize: "0.88rem", color: "var(--ink-900)", lineHeight: 1.3 }}>
                Live Weather & Alert Radar
              </strong>
              <span
                style={{
                  fontSize: "0.66rem",
                  fontWeight: 700,
                  padding: "2px 6px",
                  borderRadius: "4px",
                  background: beeSafety.badgeBg,
                  color: beeSafety.badgeColor,
                  border: `1px solid ${beeSafety.badgeColor}33`,
                  whiteSpace: "nowrap"
                }}
              >
                {beeSafety.label}
              </span>
            </div>
            <div style={{ fontSize: "0.66rem", color: "var(--ink-500)", marginTop: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              📍 {weather.latitude.toFixed(3)}°N {weather.longitude.toFixed(3)}°E • {weather.lastUpdated}
            </div>
          </div>
        </div>

        {/* Right: action buttons */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
          <button
            onClick={() => setShowForecastTimeline(!showForecastTimeline)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              background: showForecastTimeline ? "var(--primary-honey-light)" : "#F1F5F9",
              border: `1px solid ${showForecastTimeline ? "var(--primary-honey)" : "#CBD5E1"}`,
              padding: "4px 8px",
              borderRadius: "6px",
              fontSize: "0.68rem",
              color: showForecastTimeline ? "var(--primary-honey-hover)" : "var(--ink-700)",
              cursor: "pointer",
              fontWeight: 600,
              whiteSpace: "nowrap"
            }}
          >
            <FiClock size={11} />
            <span style={{ display: "inline" }}>24h Forecast</span>
            {showForecastTimeline ? <FiChevronUp size={11} /> : <FiChevronDown size={11} />}
          </button>
          <button
            onClick={loadWeather}
            title="Refresh live weather from Open-Meteo"
            style={{
              display: "inline-flex",
              alignItems: "center",
              background: "#F1F5F9",
              border: "1px solid #CBD5E1",
              padding: "5px 7px",
              borderRadius: "6px",
              color: "var(--ink-700)",
              cursor: "pointer"
            }}
          >
            <FiRefreshCw size={11} />
          </button>
        </div>
      </div>

      {/* PROACTIVE THREAT & PROBLEM ALERTS BANNER */}
      <div style={{ marginBottom: "12px", display: "flex", flexDirection: "column", gap: "6px" }}>
        {alerts.map((alert) => {
          const isCrit = alert.severity === "critical";
          const isWarn = alert.severity === "warning" || alert.severity === "danger";
          const isSucc = alert.severity === "success";

          const bg = isCrit ? "#FEF2F2" : isWarn ? "#FFFBEB" : isSucc ? "#ECFDF5" : "#EFF6FF";
          const border = isCrit ? "#FCA5A5" : isWarn ? "#FDE68A" : isSucc ? "#A7F3D0" : "#BFDBFE";
          const textCol = isCrit ? "#991B1B" : isWarn ? "#92400E" : isSucc ? "#065F46" : "#1E40AF";
          const badgeBg = isCrit ? "#FEE2E2" : isWarn ? "#FEF3C7" : isSucc ? "#D1FAE5" : "#DBEAFE";

          return (
            <div
              key={alert.id}
              style={{
                background: bg,
                border: `1px solid ${border}`,
                borderRadius: "6px",
                padding: "8px 10px",
                display: "flex",
                alignItems: "flex-start",
                gap: "8px",
                minWidth: 0,
                overflow: "hidden"
              }}
            >
              <div style={{ color: textCol, marginTop: "2px", flexShrink: 0 }}>
                {isCrit ? (
                  <FiAlertTriangle size={15} style={{ animation: "pulse 1.5s infinite" }} />
                ) : isWarn ? (
                  <FiAlertCircle size={15} />
                ) : (
                  <FiCheckCircle size={15} />
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                  <strong style={{ fontSize: "0.78rem", color: textCol }}>{alert.title}</strong>
                  <span
                    style={{
                      fontSize: "0.62rem",
                      fontWeight: 700,
                      background: badgeBg,
                      color: textCol,
                      padding: "1px 5px",
                      borderRadius: "3px",
                      whiteSpace: "nowrap"
                    }}
                  >
                    {alert.badge}
                  </span>
                </div>
                <div style={{ fontSize: "0.72rem", color: textCol, marginTop: "2px", lineHeight: 1.4, overflowWrap: "break-word", wordBreak: "break-word" }}>
                  {alert.message}
                </div>
                <div style={{ fontSize: "0.70rem", fontWeight: 600, color: textCol, marginTop: "3px", opacity: 0.9, overflowWrap: "break-word", wordBreak: "break-word" }}>
                  👉 <strong>Action Required:</strong> {alert.action}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Grid of Micro-Metrics — 4 cards, responsive */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(95px, 1fr))",
          gap: "6px",
          marginBottom: "10px"
        }}
      >
        {/* Ambient Temperature */}
        <div
          style={{
            background: "#F8FAFC",
            padding: "6px 8px",
            borderRadius: "6px",
            border: "1px solid #E2E8F0"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "4px", color: "#64748B", fontSize: "0.64rem" }}>
            <FiThermometer size={11} style={{ color: "#EF4444" }} />
            <span>OUTSIDE TEMP</span>
          </div>
          <div style={{ fontSize: "0.98rem", fontWeight: 700, color: "#0F172A", marginTop: "2px" }}>
            {weather.temp}°C
          </div>
          <div style={{ fontSize: "0.64rem", color: "#64748B" }}>
            Feels like {weather.feelsLike}°C
          </div>
        </div>

        {/* Rain / Barish Probability */}
        <div
          style={{
            background: weather.precipProb >= 40 ? "#EFF6FF" : "#F8FAFC",
            padding: "6px 8px",
            borderRadius: "6px",
            border: `1px solid ${weather.precipProb >= 40 ? "#BFDBFE" : "#E2E8F0"}`
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "4px", color: "#2563EB", fontSize: "0.64rem" }}>
            <FiCloudRain size={11} />
            <span>BARISH / RAIN</span>
          </div>
          <div style={{ fontSize: "0.98rem", fontWeight: 700, color: "#1E3A8A", marginTop: "2px" }}>
            {weather.precipProb}% Chance
          </div>
          <div style={{ fontSize: "0.64rem", color: "#3B82F6" }}>
            {weather.precip > 0 ? `Rain: ${weather.precip} mm` : "No active rain"}
          </div>
        </div>

        {/* Wind Speed / Tufan Alert */}
        <div
          style={{
            background: weather.windSpeed >= 22 ? "#FEF3C7" : "#F8FAFC",
            padding: "6px 8px",
            borderRadius: "6px",
            border: `1px solid ${weather.windSpeed >= 22 ? "#FDE68A" : "#E2E8F0"}`
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "4px", color: weather.windSpeed >= 22 ? "#B45309" : "#64748B", fontSize: "0.64rem" }}>
            <FiWind size={11} />
            <span>WIND / TUFAN</span>
          </div>
          <div style={{ fontSize: "0.98rem", fontWeight: 700, color: weather.windSpeed >= 22 ? "#92400E" : "#0F172A", marginTop: "2px" }}>
            {weather.windSpeed} km/h
          </div>
          <div style={{ fontSize: "0.64rem", color: "#64748B" }}>
            Gusts: {weather.windGusts} km/h
          </div>
        </div>

        {/* Ambient Humidity */}
        <div
          style={{
            background: "#F8FAFC",
            padding: "6px 8px",
            borderRadius: "6px",
            border: "1px solid #E2E8F0"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "4px", color: "#64748B", fontSize: "0.64rem" }}>
            <FiDroplet size={11} style={{ color: "#06B6D4" }} />
            <span>AIR HUMIDITY</span>
          </div>
          <div style={{ fontSize: "0.98rem", fontWeight: 700, color: "#0F172A", marginTop: "2px" }}>
            {weather.humidity}%
          </div>
          <div style={{ fontSize: "0.64rem", color: "#64748B" }}>
            Range: {weather.minTemp}° – {weather.maxTemp}°C
          </div>
        </div>
      </div>

      {/* Thermoregulation Comparison (if hiveTemp provided) */}
      {hiveTemp && (
        <div
          style={{
            background: "#F1F5F9",
            borderRadius: "6px",
            padding: "6px 8px",
            fontSize: "0.72rem",
            color: "var(--ink-700)",
            marginBottom: "8px",
            display: "flex",
            flexDirection: "column",
            gap: "2px"
          }}
        >
          <span>
            🌡️ <strong>Brood vs Outside:</strong> Internal: <strong>{hiveTemp}°C</strong> | Ambient: <strong>{weather.temp}°C</strong>
          </span>
          <span style={{ fontWeight: 600, color: "var(--primary-honey-hover)", fontSize: "0.70rem" }}>
            Delta: {+(hiveTemp - weather.temp).toFixed(1)}°C — {hiveTemp > weather.temp ? "Brood Heating" : "Active Water Cooling"}
          </span>
        </div>
      )}

      {/* EXPANDABLE 24-HOUR HOURLY & 3-DAY BARISH FORECAST RADAR */}
      {showForecastTimeline && (
        <div
          style={{
            background: "#FFFFFF",
            border: "1px solid #E2E8F0",
            borderRadius: "6px",
            padding: "10px",
            marginTop: "8px",
            minWidth: 0,
            overflow: "hidden"
          }}
        >
          {/* Next 12 Hours Timeline */}
          <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--ink-700)", marginBottom: "6px", display: "flex", alignItems: "center", gap: "4px" }}>
            <FiClock size={12} color="var(--primary-honey)" />
            <span>Next 12-Hour Forecast</span>
          </div>

          {/* Horizontally scrollable hourly strip */}
          <div
            style={{
              display: "flex",
              gap: "6px",
              overflowX: "auto",
              WebkitOverflowScrolling: "touch",
              paddingBottom: "8px",
              marginBottom: "10px",
              /* hide scrollbar on iOS but keep functionality */
              scrollbarWidth: "thin"
            }}
          >
            {upcomingHourly.map((h, i) => (
              <div
                key={i}
                style={{
                  minWidth: "58px",
                  maxWidth: "58px",
                  background: h.precipProb >= 40 ? "#EFF6FF" : "#F8FAFC",
                  border: `1px solid ${h.precipProb >= 40 ? "#BFDBFE" : "#E2E8F0"}`,
                  borderRadius: "6px",
                  padding: "6px 4px",
                  textAlign: "center",
                  fontSize: "10px",
                  flexShrink: 0
                }}
              >
                <div style={{ color: "#64748B", fontWeight: 600 }}>{h.hourLabel}</div>
                <div style={{ fontSize: "14px", margin: "2px 0" }}>{h.icon}</div>
                <div style={{ fontWeight: 700, color: "#0F172A" }}>{h.temp}°</div>
                <div style={{ color: h.precipProb >= 40 ? "#1E40AF" : "#64748B", fontWeight: h.precipProb >= 40 ? 700 : 400, marginTop: "2px" }}>
                  🌧️{h.precipProb}%
                </div>
                <div style={{ color: h.windSpeed >= 20 ? "#B45309" : "#94A3B8", fontSize: "9px" }}>
                  💨{h.windSpeed}k
                </div>
              </div>
            ))}
          </div>

          {/* 3-Day Forecast Cards — responsive: 3-col on desktop, 1-col on very small */}
          <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--ink-700)", marginBottom: "6px", display: "flex", alignItems: "center", gap: "4px" }}>
            <FiCalendar size={12} color="var(--primary-honey)" />
            <span>3-Day Outlook</span>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(90px, 1fr))",
              gap: "6px"
            }}
          >
            {dailyForecast.map((d, i) => (
              <div
                key={i}
                style={{
                  background: d.rainProb >= 40 ? "#EFF6FF" : "#F8FAFC",
                  border: `1px solid ${d.rainProb >= 40 ? "#BFDBFE" : "#E2E8F0"}`,
                  borderRadius: "6px",
                  padding: "8px",
                  textAlign: "center",
                  fontSize: "11px"
                }}
              >
                <strong style={{ color: "#0F172A", fontSize: "11px" }}>{d.dayName}</strong>
                <div style={{ fontSize: "18px", margin: "3px 0" }}>{d.icon}</div>
                <div style={{ fontSize: "10px", color: "#475569" }}>{d.label}</div>
                <div style={{ fontWeight: 700, color: "#0F172A", marginTop: "2px", whiteSpace: "nowrap" }}>
                  {d.minTemp}°–{d.maxTemp}°C
                </div>
                <div style={{ color: d.rainProb >= 40 ? "#2563EB" : "#64748B", fontWeight: 600, fontSize: "10px", marginTop: "2px" }}>
                  🌧️{d.rainProb}%{d.rainSum > 0 ? ` ${d.rainSum}mm` : ""}
                </div>
                <div style={{ color: d.maxGusts >= 35 ? "#DC2626" : "#64748B", fontSize: "10px" }}>
                  💨{d.maxGusts}km/h
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default HiveWeatherWidget;
