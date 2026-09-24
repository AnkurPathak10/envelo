export interface SharedLocationContent {
  latitude: number;
  longitude: number;
}

export interface SharedContactContent {
  name: string;
  phoneNumber: string | null;
  email: string | null;
}

const COORDINATE_PATTERN = '-?\\d+(?:\\.\\d+)?';
const LOCATION_HEADING_PATTERN = new RegExp(
  `^📍\\s*(${COORDINATE_PATTERN}),\\s*(${COORDINATE_PATTERN})$`
);
const LEGACY_MAPS_URL_PATTERN = new RegExp(
  `^https://maps\\.google\\.com/\\?q=(${COORDINATE_PATTERN}),(${COORDINATE_PATTERN})$`
);
const GOOGLE_MAPS_URL_PATTERN = new RegExp(
  `^https://(?:www\\.)?google\\.com/maps/search/\\?api=1&query=(${COORDINATE_PATTERN}),(${COORDINATE_PATTERN})$`
);

function isValidCoordinate(latitude: number, longitude: number): boolean {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

export function getGoogleMapsUrl(latitude: number, longitude: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
}

export function parseSharedLocation(
  content: string | null
): SharedLocationContent | null {
  if (!content) return null;

  const lines = content.trim().split(/\r?\n/);
  if (lines.length !== 2) return null;

  const headingMatch = LOCATION_HEADING_PATTERN.exec(lines[0]);
  const urlMatch =
    LEGACY_MAPS_URL_PATTERN.exec(lines[1]) ??
    GOOGLE_MAPS_URL_PATTERN.exec(lines[1]);
  if (!headingMatch || !urlMatch) return null;

  const latitude = Number(headingMatch[1]);
  const longitude = Number(headingMatch[2]);
  const linkedLatitude = Number(urlMatch[1]);
  const linkedLongitude = Number(urlMatch[2]);
  if (
    !isValidCoordinate(latitude, longitude) ||
    !isValidCoordinate(linkedLatitude, linkedLongitude) ||
    latitude !== linkedLatitude ||
    longitude !== linkedLongitude
  ) {
    return null;
  }

  return { latitude, longitude };
}

export function parseSharedContact(
  content: string | null
): SharedContactContent | null {
  if (!content) return null;

  const lines = content.trim().split(/\r?\n/);
  const nameMatch = /^👤\s+(.+)$/.exec(lines[0]);
  if (!nameMatch || lines.length > 3) return null;

  let phoneNumber: string | null = null;
  let email: string | null = null;

  for (const line of lines.slice(1)) {
    const phoneMatch = /^📞\s+(.+)$/.exec(line);
    if (phoneMatch && !phoneNumber) {
      phoneNumber = phoneMatch[1].trim();
      continue;
    }

    const emailValue = line.replace(/^✉️?\s+/, '').trim();
    if (!email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue)) {
      email = emailValue;
      continue;
    }

    return null;
  }

  return {
    email,
    name: nameMatch[1].trim(),
    phoneNumber,
  };
}
