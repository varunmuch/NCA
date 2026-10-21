// Backend timestamps are naive UTC ISO strings.
export function parseDate(value: string | null | undefined): Date | null {
  if (!value) {
    return null;
  }

  const normalized = /[zZ]|[+-]\d\d:\d\d$/.test(value) ? value : `${value}Z`;
  const date = new Date(normalized);

  return Number.isNaN(date.getTime()) ? null : date;
}

export function timeAgo(value: string | null | undefined): string {
  const date = parseDate(value);

  if (!date) {
    return "";
  }

  const seconds = Math.round((Date.now() - date.getTime()) / 1000);

  if (seconds < 60) {
    return "just now";
  }

  const minutes = Math.round(seconds / 60);

  if (minutes < 60) {
    return `${minutes} min ago`;
  }

  const hours = Math.round(minutes / 60);

  if (hours < 24) {
    return `${hours} hr ago`;
  }

  const days = Math.round(hours / 24);

  if (days < 7) {
    return days === 1 ? "yesterday" : `${days} days ago`;
  }

  return formatDate(value);
}

export function formatDate(value: string | null | undefined): string {
  const date = parseDate(value);

  if (!date) {
    return "";
  }

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  });
}

export function formatTime(value: string | null | undefined): string {
  const date = parseDate(value);

  if (!date) {
    return "";
  }

  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function preparationLabel(jobZone: number | null): string {
  switch (jobZone) {
    case 1:
    case 2:
      return "Little to some preparation";
    case 3:
      return "Medium preparation";
    case 4:
      return "Considerable preparation";
    case 5:
      return "Extensive preparation";
    default:
      return "";
  }
}
