/**
 * HoneyChain Geolocation Engine
 * Captures real-time device GPS coordinates and compass orientation
 * for non-repudiation chain of custody events.
 */

export const REGIONAL_FALLBACK_COORDINATES = {
  BEEKEEPER: {
    lat: 33.9982,
    lng: 74.9189,
    latitude: 33.9982,
    longitude: 74.9189,
    formatted: '33.9982° N, 74.9189° E',
    location: 'Pulwama Cluster, Jammu & Kashmir',
    label: 'Apiary Harvest Cluster'
  },
  LAB: {
    lat: 34.0837,
    lng: 74.7973,
    latitude: 34.0837,
    longitude: 74.7973,
    formatted: '34.0837° N, 74.7973° E',
    location: 'Srinagar Food Purity Complex',
    label: 'KVIC Quality Testing Lab'
  },
  PROCESSOR: {
    lat: 32.6468,
    lng: 74.9351,
    latitude: 32.6468,
    longitude: 74.9351,
    formatted: '32.6468° N, 74.9351° E',
    location: 'SIDCO Industrial Complex, Bari Brahmana',
    label: 'Honey Processing & Bottling Facility'
  },
  DISTRIBUTOR: {
    lat: 28.6139,
    lng: 77.2090,
    latitude: 28.6139,
    longitude: 77.2090,
    formatted: '28.6139° N, 77.2090° E',
    location: 'Northern Cold-Chain Transit Corridor',
    label: 'Cold-Chain Logistics Hub'
  },
  RETAILER: {
    lat: 28.6315,
    lng: 77.2167,
    latitude: 28.6315,
    longitude: 77.2167,
    formatted: '28.6315° N, 77.2167° E',
    location: 'Connaught Place, New Delhi',
    label: 'KVIC Khadi Gramodyog Bhavan'
  }
};

export const formatCoordinates = (lat, lng) => {
  if (lat === undefined || lng === undefined || lat === null || lng === null) return '';
  const numLat = parseFloat(lat);
  const numLng = parseFloat(lng);
  if (isNaN(numLat) || isNaN(numLng)) return '';

  const latDir = numLat >= 0 ? 'N' : 'S';
  const lngDir = numLng >= 0 ? 'E' : 'W';

  return `${Math.abs(numLat).toFixed(4)}° ${latDir}, ${Math.abs(numLng).toFixed(4)}° ${lngDir}`;
};

/**
 * Queries device GPS via Web Geolocation API with graceful fallback to regional coordinates.
 * @param {string} roleContext - 'BEEKEEPER' | 'LAB' | 'PROCESSOR' | 'DISTRIBUTOR' | 'RETAILER'
 * @returns {Promise<{lat: number, lng: number, latitude: number, longitude: number, accuracy: number, formatted: string, isLiveGPS: boolean, timestamp: number}>}
 */
export const captureDeviceCoordinates = async (roleContext = 'PROCESSOR') => {
  const fallback = REGIONAL_FALLBACK_COORDINATES[roleContext] || REGIONAL_FALLBACK_COORDINATES.PROCESSOR;

  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return {
      lat: fallback.lat,
      lng: fallback.lng,
      latitude: fallback.lat,
      longitude: fallback.lng,
      accuracy: 25,
      formatted: formatCoordinates(fallback.lat, fallback.lng),
      locationName: fallback.location,
      isLiveGPS: false,
      timestamp: Math.floor(Date.now() / 1000)
    };
  }

  return new Promise((resolve) => {
    let resolved = false;

    // Timeout safety fallback after 3.5 seconds to keep UI lightning-fast
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve({
          lat: fallback.lat,
          lng: fallback.lng,
          latitude: fallback.lat,
          longitude: fallback.lng,
          accuracy: 25,
          formatted: formatCoordinates(fallback.lat, fallback.lng),
          locationName: fallback.location,
          isLiveGPS: false,
          timestamp: Math.floor(Date.now() / 1000)
        });
      }
    }, 3500);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          const lat = +(pos.coords.latitude).toFixed(4);
          const lng = +(pos.coords.longitude).toFixed(4);
          resolve({
            lat,
            lng,
            latitude: lat,
            longitude: lng,
            accuracy: Math.round(pos.coords.accuracy || 10),
            formatted: formatCoordinates(lat, lng),
            locationName: fallback.location,
            isLiveGPS: true,
            timestamp: Math.floor(pos.timestamp / 1000 || Date.now() / 1000)
          });
        }
      },
      (err) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          console.warn('Live GPS query declined or unavailable, using regional baseline:', err.message);
          resolve({
            lat: fallback.lat,
            lng: fallback.lng,
            latitude: fallback.lat,
            longitude: fallback.lng,
            accuracy: 30,
            formatted: formatCoordinates(fallback.lat, fallback.lng),
            locationName: fallback.location,
            isLiveGPS: false,
            timestamp: Math.floor(Date.now() / 1000)
          });
        }
      },
      { enableHighAccuracy: true, timeout: 3000, maximumAge: 30000 }
    );
  });
};

/**
 * Regional apiary cluster coordinates mapped by Indian states
 */
export const STATE_COORDINATES = {
  'PAMPORE': { lat: 34.0205, lng: 74.9312, name: 'Pampore Saffron & Flora Belt, J&K', state: 'Jammu & Kashmir' },
  'SRINAGAR': { lat: 34.0837, lng: 74.7973, name: 'Srinagar Apiary Complex, J&K', state: 'Jammu & Kashmir' },
  'PULWAMA': { lat: 33.9982, lng: 74.9189, name: 'Pulwama Valley Apiary Cluster, J&K', state: 'Jammu & Kashmir' },
  'AGRA': { lat: 27.1767, lng: 78.0081, name: 'Agra Apiary Cluster, Uttar Pradesh', state: 'Uttar Pradesh' },
  'DELHI NCR': { lat: 28.6139, lng: 77.2090, name: 'Delhi-NCR Agro Cluster', state: 'Delhi' },
  'HIMACHAL PRADESH': { lat: 31.1048, lng: 77.1734, name: 'Shimla Apple-Flora Apiary, HP', state: 'Himachal Pradesh' },
  'UTTARAKHAND': { lat: 30.3165, lng: 78.0322, name: 'Dehradun Forest Apiary, Uttarakhand', state: 'Uttarakhand' },
  'PUNJAB': { lat: 30.7333, lng: 76.7794, name: 'Mustard Agricultural Cluster, Punjab', state: 'Punjab' },
  'HARYANA': { lat: 29.0588, lng: 76.0856, name: 'Agro-Apiary Cluster, Haryana', state: 'Haryana' },
  'UTTAR PRADESH': { lat: 26.8467, lng: 80.9462, name: 'Gangetic Basin Apiary, UP', state: 'Uttar Pradesh' },
  'WEST BENGAL': { lat: 21.9497, lng: 89.1833, name: 'Sundarbans Mangrove Wild Flora, WB', state: 'West Bengal' },
  'RAJASTHAN': { lat: 26.9124, lng: 75.7873, name: 'Desert Flora & Mustard Belt, Rajasthan', state: 'Rajasthan' },
  'GUJARAT': { lat: 23.0225, lng: 72.5714, name: 'Gir Organic Flora Reserve, Gujarat', state: 'Gujarat' },
  'MAHARASHTRA': { lat: 17.9237, lng: 73.6586, name: 'Mahabaleshwar Honey Village, Maharashtra', state: 'Maharashtra' },
  'KARNATAKA': { lat: 12.3375, lng: 75.8069, name: 'Coorg Multifloral Forest Apiary, Karnataka', state: 'Karnataka' },
  'KERALA': { lat: 10.8505, lng: 76.2711, name: 'Western Ghats Rainforest Apiary, Kerala', state: 'Kerala' },
  'TAMIL NADU': { lat: 11.4102, lng: 76.6950, name: 'Nilgiris Wild Honey Reserve, TN', state: 'Tamil Nadu' },
  'MADHYA PRADESH': { lat: 23.2599, lng: 77.4126, name: 'Satpura Forest Apiary Cluster, MP', state: 'Madhya Pradesh' },
  'ASSAM': { lat: 26.2006, lng: 92.9376, name: 'Kaziranga Buffer Zone Apiary, Assam', state: 'Assam' },
  'JAMMU & KASHMIR': { lat: 33.9982, lng: 74.9189, name: 'Pulwama Valley Apiary Cluster, J&K', state: 'Jammu & Kashmir' }
};

/**
 * Returns regional cluster baseline coordinates based on state or cluster name
 */
export const getRegionalHiveCoordinates = (state = '', location = '') => {
  const cleanState = (state || '').toUpperCase().trim();
  const cleanLoc = (location || '').toUpperCase().trim();

  // Check specific location first (e.g. Pampore, Srinagar, Agra)
  for (const [key, coords] of Object.entries(STATE_COORDINATES)) {
    if (cleanLoc && (cleanLoc.includes(key) || (cleanLoc.length >= 3 && key.includes(cleanLoc)))) {
      return {
        lat: coords.lat,
        lng: coords.lng,
        latitude: coords.lat,
        longitude: coords.lng,
        formatted: formatCoordinates(coords.lat, coords.lng),
        locationName: location || coords.name,
        state: coords.state,
        accuracy: 25,
        isLiveGPS: false,
        timestamp: Math.floor(Date.now() / 1000)
      };
    }
  }

  // Check state second
  for (const [key, coords] of Object.entries(STATE_COORDINATES)) {
    if (cleanState && (cleanState.includes(key) || (cleanState.length >= 3 && key.includes(cleanState)))) {
      return {
        lat: coords.lat,
        lng: coords.lng,
        latitude: coords.lat,
        longitude: coords.lng,
        formatted: formatCoordinates(coords.lat, coords.lng),
        locationName: location || coords.name,
        state: coords.state,
        accuracy: 25,
        isLiveGPS: false,
        timestamp: Math.floor(Date.now() / 1000)
      };
    }
  }

  // Generic fallback if coordinates not found
  return {
    lat: 33.9982,
    lng: 74.9189,
    latitude: 33.9982,
    longitude: 74.9189,
    formatted: '33.9982° N, 74.9189° E',
    locationName: location || (state ? `${state} Apiary Belt` : 'Rural Apiary Cluster'),
    state: state || 'India',
    accuracy: 30,
    isLiveGPS: false,
    timestamp: Math.floor(Date.now() / 1000)
  };
};

/**
 * Resolves a human-readable area name from numerical GPS coordinates
 */
export const resolveCoordinateArea = (lat, lng, fallbackLocation = '') => {
  // If a meaningful user-specified location is provided, ALWAYS preserve it!
  const cleanFallback = (fallbackLocation || '').trim();
  if (cleanFallback && 
      cleanFallback.toLowerCase() !== 'apiary cluster' && 
      cleanFallback.toLowerCase() !== 'apiary zone' &&
      cleanFallback.toLowerCase() !== 'india') {
    return cleanFallback;
  }

  const numLat = parseFloat(lat);
  const numLng = parseFloat(lng);
  if (isNaN(numLat) || isNaN(numLng)) return cleanFallback || 'Apiary Cluster';

  // Find the closest cluster centroid
  let closest = null;
  let minDistSq = Infinity;

  for (const info of Object.values(STATE_COORDINATES)) {
    const dLat = numLat - info.lat;
    const dLng = numLng - info.lng;
    const distSq = dLat * dLat + dLng * dLng;
    if (distSq < minDistSq) {
      minDistSq = distSq;
      closest = info;
    }
  }

  // Only snap if within tight proximity (~25km, distSq < 0.06)
  if (closest && minDistSq < 0.06) {
    return closest.name;
  }

  return cleanFallback || `GPS Sector (${formatCoordinates(numLat, numLng)})`;
};

/**
 * Queries OpenStreetMap Nominatim reverse-geocoder to get real city and state from coordinates
 */
export const reverseGeocodeCoordinates = async (lat, lng) => {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2600);
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=10`, {
      signal: controller.signal,
      headers: { 'Accept-Language': 'en' }
    });
    clearTimeout(timer);
    if (res.ok) {
      const data = await res.json();
      if (data && data.address) {
        const addr = data.address;
        const city = addr.city || addr.town || addr.district || addr.county || addr.village || addr.state_district || '';
        const state = addr.state || '';
        if (city && state) {
          return {
            locationName: `${city} Cluster, ${state}`,
            state,
            city
          };
        }
        if (city) {
          return { locationName: `${city} Apiary Cluster`, state: state || '', city };
        }
        if (state) {
          return { locationName: `${state} Apiary Belt`, state, city: '' };
        }
      }
    }
  } catch (e) {
    // Offline or network timeout fallback
  }

  // Fallback to closest local centroid
  const localName = resolveCoordinateArea(lat, lng, '');
  return { locationName: localName, state: '', city: '' };
};

/**
 * Captures live device GPS coordinates for Smart Hive installation with graceful state baseline fallback
 */
export const captureHiveCoordinates = async (stateHint = '', locationHint = '') => {
  const fallback = getRegionalHiveCoordinates(stateHint, locationHint);

  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return fallback;
  }

  return new Promise((resolve) => {
    let resolved = false;

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve(fallback);
      }
    }, 4500);

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          const lat = +(pos.coords.latitude).toFixed(4);
          const lng = +(pos.coords.longitude).toFixed(4);

          // Reverse geocode real device coordinates to determine exact location
          let resolvedLoc = fallback.locationName;
          let resolvedState = fallback.state;
          try {
            const geoInfo = await reverseGeocodeCoordinates(lat, lng);
            if (geoInfo && geoInfo.locationName) {
              resolvedLoc = geoInfo.locationName;
              if (geoInfo.state) resolvedState = geoInfo.state;
            }
          } catch (_) {}

          resolve({
            lat,
            lng,
            latitude: lat,
            longitude: lng,
            accuracy: Math.round(pos.coords.accuracy || 8),
            formatted: formatCoordinates(lat, lng),
            locationName: resolvedLoc,
            state: resolvedState,
            isLiveGPS: true,
            timestamp: Math.floor(pos.timestamp / 1000 || Date.now() / 1000)
          });
        }
      },
      (err) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          console.warn('Live hive GPS query declined or unavailable, using regional cluster coordinates:', err.message);
          resolve(fallback);
        }
      },
      { enableHighAccuracy: true, timeout: 3500, maximumAge: 30000 }
    );
  });
};

/**
 * Generates an external Google Maps link to visualize exact GPS coordinates
 */
export const getGoogleMapsUrl = (lat, lng) => {
  if (lat === undefined || lng === undefined || lat === null || lng === null) return '';
  return `https://www.google.com/maps?q=${encodeURIComponent(`${lat},${lng}`)}`;
};


