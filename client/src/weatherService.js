/**
 * HoneyChain Live Weather & Environmental Threat Radar Service
 * Powered by Open-Meteo (100% Free, Zero API Key Required)
 */

const WEATHER_CACHE = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache

/**
 * WMO Weather Code dictionary
 */
export const WMO_CODES = {
  0: { label: "Clear Sky", icon: "☀️", category: "clear" },
  1: { label: "Mainly Clear", icon: "🌤️", category: "clear" },
  2: { label: "Partly Cloudy", icon: "⛅", category: "cloudy" },
  3: { label: "Overcast", icon: "☁️", category: "cloudy" },
  45: { label: "Foggy", icon: "🌫️", category: "fog" },
  48: { label: "Icy Fog", icon: "🌫️", category: "fog" },
  51: { label: "Light Drizzle", icon: "🌦️", category: "drizzle" },
  53: { label: "Moderate Drizzle", icon: "🌦️", category: "drizzle" },
  55: { label: "Dense Drizzle", icon: "🌧️", category: "drizzle" },
  56: { label: "Freezing Drizzle", icon: "🌧️", category: "rain" },
  57: { label: "Heavy Freezing Drizzle", icon: "🌧️", category: "rain" },
  61: { label: "Slight Rain", icon: "🌦️", category: "rain" },
  63: { label: "Moderate Rain", icon: "🌧️", category: "rain" },
  65: { label: "Heavy Rain (Barish)", icon: "🌧️", category: "rain" },
  66: { label: "Freezing Rain", icon: "🌧️", category: "rain" },
  67: { label: "Heavy Freezing Rain", icon: "🌧️", category: "rain" },
  71: { label: "Slight Snow", icon: "🌨️", category: "snow" },
  73: { label: "Moderate Snow", icon: "❄️", category: "snow" },
  75: { label: "Heavy Snow", icon: "❄️", category: "snow" },
  77: { label: "Snow Grains", icon: "❄️", category: "snow" },
  80: { label: "Slight Showers", icon: "🌦️", category: "rain" },
  81: { label: "Moderate Showers", icon: "🌧️", category: "rain" },
  82: { label: "Violent Rain Showers", icon: "⛈️", category: "storm" },
  85: { label: "Slight Snow Showers", icon: "🌨️", category: "snow" },
  86: { label: "Heavy Snow Showers", icon: "❄️", category: "snow" },
  95: { label: "Thunderstorm (Tufan)", icon: "⛈️", category: "storm" },
  96: { label: "Severe Thunderstorm with Hail", icon: "⛈️", category: "storm" },
  99: { label: "Violent Hailstorm & Tufan", icon: "⛈️", category: "storm" }
};

/**
 * Get weather interpretation for WMO code
 */
export const getWeatherInfo = (code) => {
  return WMO_CODES[code] || { label: "Variable Weather", icon: "⛅", category: "variable" };
};

/**
 * Evaluate Colony Flight Safety & Environmental Risk
 */
export const evaluateBeeConditions = ({ temp, windSpeed, windGusts, precip, precipProb, weatherCode }) => {
  const isStorm = [95, 96, 99].includes(weatherCode) || windGusts >= 40;
  const isHeavyRain = [63, 65, 81, 82].includes(weatherCode) || precip >= 2.0;
  const isRain = precip > 0.2 || [51, 53, 55, 61, 80].includes(weatherCode);
  const isHighWind = windSpeed >= 25;
  const isExtremeHeat = temp >= 38;
  const isCold = temp < 14;

  if (isStorm) {
    return {
      status: "HAZARD",
      level: "critical",
      label: "⚡ Severe Tufan / Storm Warning",
      badgeColor: "#DC2626",
      badgeBg: "#FEF2F2",
      flightAllowed: false,
      advice: "High wind gusts & electrical storm. Hives locked down; foraging completely suspended. Secure box straps."
    };
  }

  if (isHeavyRain) {
    return {
      status: "UNFAVORABLE",
      level: "danger",
      label: "🌧️ Heavy Rain (Barish Alert)",
      badgeColor: "#EA580C",
      badgeBg: "#FFF7ED",
      flightAllowed: false,
      advice: "Continuous heavy rain. Bees maintaining tight cluster thermoregulation. Avoid opening hive lids."
    };
  }

  if (isHighWind) {
    return {
      status: "CAUTION",
      level: "warning",
      label: "💨 High Wind Velocity Alert",
      badgeColor: "#D97706",
      badgeBg: "#FEF3C7",
      flightAllowed: false,
      advice: `Wind speed (${windSpeed} km/h) exceeds safe 25 km/h bee flight threshold. High navigation disorientation risk.`
    };
  }

  if (isRain) {
    return {
      status: "CAUTION",
      level: "warning",
      label: "🌦️ Light Rain / Drizzle",
      badgeColor: "#2563EB",
      badgeBg: "#EFF6FF",
      flightAllowed: false,
      advice: "Precipitation dampens bee wings. Most foragers will return to hive entrance within minutes."
    };
  }

  if (isExtremeHeat) {
    return {
      status: "CAUTION",
      level: "warning",
      label: "🔥 Colony Heat Stress Alert",
      badgeColor: "#E11D48",
      badgeBg: "#FFE4E6",
      flightAllowed: true,
      advice: `Ambient temp ${temp}°C. Active comb melting risk. Bees will engage in heavy water collection & fanning.`
    };
  }

  if (isCold) {
    return {
      status: "RESTRICTED",
      level: "warning",
      label: "❄️ Sub-flight Temperature (<14°C)",
      badgeColor: "#0284C7",
      badgeBg: "#F0F9FF",
      flightAllowed: false,
      advice: "Chilly conditions. Colony conserving energy inside brood chamber. Flight starts once temp crosses 14°C."
    };
  }

  return {
    status: "OPTIMAL",
    level: "success",
    label: "🌸 Ideal Foraging Conditions",
    badgeColor: "#059669",
    badgeBg: "#ECFDF5",
    flightAllowed: true,
    advice: `Calm winds (${windSpeed} km/h) and optimal ${temp}°C temp. Peak nectar gathering and pollen collection active.`
  };
};

/**
 * Generate Proactive Threat & Forecast Alerts for a Hive
 * Combines forward-looking meteorology with hive telemetry
 */
export const generateHiveThreatAlerts = (weather, hive = {}) => {
  const alerts = [];
  if (!weather) return alerts;

  const {
    temp,
    windSpeed,
    windGusts,
    precip,
    dailyForecast = [],
    upcomingHourly = []
  } = weather;

  const todayForecast = dailyForecast[0] || {};
  const tomorrowForecast = dailyForecast[1] || {};

  // 1. FORWARD-LOOKING RAIN / BARISH FORECAST ALERT
  const upcomingRainHour = upcomingHourly.find(h => h.precipProb >= 45 || h.precip >= 0.8);
  const maxRainProb = Math.max(todayForecast.rainProb || 0, tomorrowForecast.rainProb || 0);
  const totalExpectedRain = +( (todayForecast.rainSum || 0) + (tomorrowForecast.rainSum || 0) ).toFixed(1);

  if (precip > 0.5 || maxRainProb >= 45 || upcomingRainHour) {
    const isImminent = precip > 0 || (upcomingRainHour && upcomingHourly.indexOf(upcomingRainHour) <= 4);
    alerts.push({
      id: "alert-rain-forecast",
      severity: maxRainProb >= 70 || totalExpectedRain >= 8 ? "danger" : "warning",
      badge: isImminent ? "🌧️ Barish Shuru / Active Rain" : "🌧️ Aage Barish Ki Chetwani",
      title: isImminent ? "Active / Imminent Rain in Hive Vicinity" : `Upcoming Rain Forecast (${maxRainProb}% Chance)`,
      message: isImminent
        ? `Rainfall active or starting in the next few hours (${maxRainProb}% probability). Expected volume: ~${totalExpectedRain} mm.`
        : `Rain forecasted in the next 24–48 hours (${maxRainProb}% chance, expected volume ~${totalExpectedRain} mm). Flight activity will drop sharply.`,
      action: "Protect hive entrance from water pooling. Do not unseal inner brood frames during humid rain conditions."
    });
  }

  // 2. FORWARD-LOOKING STORM / TUFAN / HIGH GUSTS ALERT
  const maxForecastGusts = Math.max(windGusts, todayForecast.maxGusts || 0, tomorrowForecast.maxGusts || 0);
  const hasStormCode = [82, 95, 96, 99].includes(weather.weatherCode) ||
    [82, 95, 96, 99].includes(todayForecast.code) ||
    [82, 95, 96, 99].includes(tomorrowForecast.code);

  if (maxForecastGusts >= 35 || hasStormCode) {
    alerts.push({
      id: "alert-storm-tufan",
      severity: "critical",
      badge: "⚡ Tufan / Storm Warning",
      title: `Severe Storm & High Wind Threat (${maxForecastGusts} km/h Gusts)`,
      message: `Severe wind velocity & gusts up to ${maxForecastGusts} km/h forecasted. Extreme risk of hive toppling and roof blown-off.`,
      action: "URGENT ACTION: Anchor hive boxes with heavy weight stones or ratchet tie-down straps immediately!"
    });
  } else if (windSpeed >= 22) {
    alerts.push({
      id: "alert-wind-caution",
      severity: "warning",
      badge: "💨 High Wind Advisory",
      title: `Strong Crosswinds (${windSpeed} km/h)`,
      message: `Wind speed exceeds 20 km/h. Forager bees experience heavy navigation drift and flower approach difficulty.`,
      action: "Ensure apiary windbreak hedges are intact; flight will resume when winds subside."
    });
  }

  // 3. HEATWAVE / COLD ANOMALY
  const forecastMaxTemp = Math.max(temp, todayForecast.maxTemp || 0, tomorrowForecast.maxTemp || 0);
  const forecastMinTemp = Math.min(temp, todayForecast.minTemp || 99, tomorrowForecast.minTemp || 99);

  if (forecastMaxTemp >= 38) {
    alerts.push({
      id: "alert-heat-stress",
      severity: "danger",
      badge: "🔥 Extreme Heatwave Risk",
      title: `Colony Heatwave Threat (Peak ${forecastMaxTemp}°C)`,
      message: `Ambient heat exceeding 38°C creates dangerous brood comb melting risk and absconding trigger.`,
      action: "Provide immediate canopy shade tarpaulins and continuous clean water pans with floating corks."
    });
  } else if (forecastMinTemp <= 13) {
    alerts.push({
      id: "alert-cold-wave",
      severity: "info",
      badge: "❄️ Low Night Temperature",
      title: `Chilly Night Temperature (${forecastMinTemp}°C)`,
      message: `Night temperatures dipping below 14°C minimum flight threshold.`,
      action: "Ensure entrance reducers are inserted so nighttime chilly drafts do not cool brood edges."
    });
  }

  // 4. HIVE INTERNAL SENSOR THREATS (Combined with Telemetry)
  if (hive.freq && hive.freq > 380) {
    alerts.push({
      id: "alert-swarm-alarm",
      severity: "critical",
      badge: "🚨 Swarm Tone Alarm",
      title: `High Acoustic Swarming Frequency (${hive.freq} Hz)`,
      message: `Acoustic FFT frequency is ${hive.freq} Hz (Normal: 180–250 Hz). Workers are piping and colony is preparing to swarm.`,
      action: "IMMEDIATE INSPECTION: Open brood chamber, look for sealed queen cells, and perform colony artificial split."
    });
  }

  if (hive.temp && (hive.temp < 32.5 || hive.temp > 36.8)) {
    alerts.push({
      id: "alert-brood-stress",
      severity: "warning",
      badge: "🌡️ Brood Thermal Deviation",
      title: `Brood Core Temp (${hive.temp}°C) Out of Optimal Band`,
      message: `Healthy brood homeostasis requires 33.5°C–36.0°C. Current reading indicates thermoregulation stress.`,
      action: "Check bee cluster density on frames and inspect for draft leaks or excess sun exposure."
    });
  }

  if (hive.humidity && hive.humidity > 74) {
    alerts.push({
      id: "alert-moisture-risk",
      severity: "warning",
      badge: "💧 High Brood Moisture",
      title: `Internal Humidity Elevation (${hive.humidity}%)`,
      message: `High internal hive humidity combined with ambient moisture promotes chalkbrood & varroa proliferation.`,
      action: "Verify upper screen ventilation vents are open to allow moist air exhaust."
    });
  }

  // Default optimal status if no critical or danger issues
  if (alerts.length === 0) {
    alerts.push({
      id: "alert-all-clear",
      severity: "success",
      badge: "✅ All Clear & Optimal",
      title: "Apiary Biosecurity & Weather Homeostasis Safe",
      message: "No upcoming rainstorm hazards, normal ambient wind flow, and brood telemetry is in optimal balance.",
      action: "Standard apiary monitoring. Colony is in active nectar accumulation phase."
    });
  }

  return alerts;
};

/**
 * Fetch Hyper-Local Hive Weather & 3-Day Forecast from Open-Meteo API
 * @param {number} lat - Latitude (e.g. 27.2384)
 * @param {number} lng - Longitude (e.g. 78.0085)
 * @returns {Promise<Object>} Formatted weather telemetry and predictive radar
 */
export const fetchHiveWeather = async (lat, lng) => {
  const latitude = parseFloat(lat);
  const longitude = parseFloat(lng);

  if (isNaN(latitude) || isNaN(longitude)) {
    throw new Error("Invalid GPS coordinates provided for weather forecast.");
  }

  // Cache key rounded to 3 decimals (~100m accuracy)
  const cacheKey = `${latitude.toFixed(3)},${longitude.toFixed(3)}`;
  const now = Date.now();

  if (WEATHER_CACHE.has(cacheKey)) {
    const cached = WEATHER_CACHE.get(cacheKey);
    if (now - cached.timestamp < CACHE_TTL_MS) {
      return cached.data;
    }
  }

  const endpoint = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,weather_code,wind_speed_10m,wind_gusts_10m&hourly=temperature_2m,precipitation_probability,precipitation,rain,weather_code,wind_speed_10m,wind_gusts_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max&forecast_days=3&timezone=auto`;

  try {
    const response = await fetch(endpoint);
    if (!response.ok) {
      throw new Error(`Open-Meteo responded with status ${response.status}`);
    }

    const data = await response.json();
    const cur = data.current || {};
    const daily = data.daily || {};
    const hourly = data.hourly || {};

    const weatherCode = cur.weather_code ?? 0;
    const weatherInfo = getWeatherInfo(weatherCode);

    const temp = Math.round(cur.temperature_2m ?? 24);
    const feelsLike = Math.round(cur.apparent_temperature ?? temp);
    const humidity = Math.round(cur.relative_humidity_2m ?? 50);
    const windSpeed = Math.round(cur.wind_speed_10m ?? 8);
    const windGusts = Math.round(cur.wind_gusts_10m ?? windSpeed);
    const precip = parseFloat(cur.precipitation ?? 0);
    const rain = parseFloat(cur.rain ?? 0);
    const precipProb = daily.precipitation_probability_max?.[0] ?? (precip > 0 ? 90 : 10);
    const maxTemp = Math.round(daily.temperature_2m_max?.[0] ?? temp + 3);
    const minTemp = Math.round(daily.temperature_2m_min?.[0] ?? temp - 4);
    const isDay = Boolean(cur.is_day ?? 1);

    // Parse Next 12 Hours Forecast
    const hourlyTimes = hourly.time || [];
    const currentIsoHour = cur.time ? cur.time.slice(0, 13) : '';
    let startIndex = hourlyTimes.findIndex(t => t.startsWith(currentIsoHour));
    if (startIndex === -1) startIndex = 0;

    const upcomingHourly = hourlyTimes.slice(startIndex, startIndex + 12).map((timeStr, idx) => {
      const i = startIndex + idx;
      const code = hourly.weather_code?.[i] ?? 0;
      const wInfo = getWeatherInfo(code);
      const dateObj = new Date(timeStr);
      const hourLabel = dateObj.toLocaleTimeString([], { hour: 'numeric', hour12: true });
      return {
        time: timeStr,
        hourLabel,
        temp: Math.round(hourly.temperature_2m?.[i] ?? temp),
        precipProb: Math.round(hourly.precipitation_probability?.[i] ?? 0),
        precip: parseFloat(hourly.precipitation?.[i] ?? 0),
        windSpeed: Math.round(hourly.wind_speed_10m?.[i] ?? windSpeed),
        windGusts: Math.round(hourly.wind_gusts_10m?.[i] ?? windGusts),
        icon: wInfo.icon,
        condition: wInfo.label,
        weatherCode: code
      };
    });

    // Parse 3-Day Forecast
    const dailyDates = daily.time || [];
    const dailyForecast = dailyDates.slice(0, 3).map((dStr, idx) => {
      const code = daily.weather_code?.[idx] ?? 0;
      const wInfo = getWeatherInfo(code);
      const dateObj = new Date(dStr);
      const dayName = idx === 0 ? "Today" : idx === 1 ? "Tomorrow" : dateObj.toLocaleDateString([], { weekday: 'short' });
      return {
        date: dStr,
        dayName,
        code,
        icon: wInfo.icon,
        label: wInfo.label,
        maxTemp: Math.round(daily.temperature_2m_max?.[idx] ?? temp),
        minTemp: Math.round(daily.temperature_2m_min?.[idx] ?? temp),
        rainProb: Math.round(daily.precipitation_probability_max?.[idx] ?? 0),
        rainSum: parseFloat(daily.precipitation_sum?.[idx] ?? 0),
        maxGusts: Math.round(daily.wind_gusts_10m_max?.[idx] ?? windGusts)
      };
    });

    const beeConditions = evaluateBeeConditions({
      temp,
      windSpeed,
      windGusts,
      precip,
      precipProb,
      weatherCode
    });

    const formattedResult = {
      latitude,
      longitude,
      temp,
      feelsLike,
      humidity,
      windSpeed,
      windGusts,
      precip,
      rain,
      precipProb,
      maxTemp,
      minTemp,
      isDay,
      weatherCode,
      conditionLabel: weatherInfo.label,
      conditionIcon: weatherInfo.icon,
      category: weatherInfo.category,
      isStorm: beeConditions.status === "HAZARD" || (dailyForecast[0]?.maxGusts >= 38),
      isRainActive: precip > 0 || [61, 63, 65, 80, 81, 82].includes(weatherCode),
      beeSafety: beeConditions,
      upcomingHourly,
      dailyForecast,
      lastUpdated: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    // Cache result
    WEATHER_CACHE.set(cacheKey, { timestamp: now, data: formattedResult });
    return formattedResult;
  } catch (error) {
    console.error("Open-Meteo Weather Fetch Error:", error);
    // Graceful fallback with safe baseline
    return {
      latitude,
      longitude,
      temp: 26,
      feelsLike: 26,
      humidity: 55,
      windSpeed: 10,
      windGusts: 14,
      precip: 0,
      rain: 0,
      precipProb: 15,
      maxTemp: 29,
      minTemp: 21,
      isDay: true,
      weatherCode: 0,
      conditionLabel: "Clear Sky (Baseline)",
      conditionIcon: "☀️",
      category: "clear",
      isStorm: false,
      isRainActive: false,
      beeSafety: {
        status: "OPTIMAL",
        level: "success",
        label: "🌸 Favorable Ambient Conditions",
        badgeColor: "#059669",
        badgeBg: "#ECFDF5",
        flightAllowed: true,
        advice: "Standard ambient telemetry baseline active."
      },
      upcomingHourly: [],
      dailyForecast: [
        { dayName: "Today", label: "Clear", icon: "☀️", maxTemp: 29, minTemp: 21, rainProb: 15, rainSum: 0, maxGusts: 15 },
        { dayName: "Tomorrow", label: "Clear", icon: "☀️", maxTemp: 30, minTemp: 22, rainProb: 10, rainSum: 0, maxGusts: 16 },
        { dayName: "Day After", label: "Partly Cloudy", icon: "⛅", maxTemp: 28, minTemp: 20, rainProb: 20, rainSum: 0.2, maxGusts: 18 }
      ],
      lastUpdated: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isFallback: true
    };
  }
};
