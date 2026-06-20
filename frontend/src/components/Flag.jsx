import { useState } from 'react';
import { getTeamCountryCode, getTeamDisplayName } from '../utils/constants';

const FLAG_CDN_BASE_URL = 'https://flagcdn.com';

export function Flag({ countryCode, countryName, decorative = true, className = '' }) {
  const [failed, setFailed] = useState(false);
  const code = String(countryCode || '').toLowerCase();
  const label = countryName || '國家';

  if (!code || failed) {
    return (
      <span
        className={`country-flag country-flag-fallback ${className}`.trim()}
        aria-hidden={decorative ? 'true' : undefined}
        role={decorative ? undefined : 'img'}
        aria-label={decorative ? undefined : `${label}國旗無法載入`}
      />
    );
  }

  return (
    <img
      className={`country-flag ${className}`.trim()}
      src={`${FLAG_CDN_BASE_URL}/${code}.svg`}
      alt={decorative ? '' : `${label}國旗`}
      aria-hidden={decorative ? 'true' : undefined}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}

export function TeamLabel({ name, className = '', showFlag = true }) {
  const displayName = getTeamDisplayName(name);
  return (
    <span className={`team-label ${className}`.trim()} aria-label={displayName}>
      {showFlag && (
        <Flag countryCode={getTeamCountryCode(name)} countryName={displayName} />
      )}
      <span className="team-label-name">{displayName}</span>
    </span>
  );
}
