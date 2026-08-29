// ============================================================
// StaffAvatar — small square portrait (photo bank) with initials fallback
// ------------------------------------------------------------
// Shared between the Staff screen roster/hiring cards and the staff
// detail modal. Photo paths are public paths under /staff-photos/; a
// broken photo degrades to the member's initials.
// ============================================================

import { useState } from 'react';
import type { StaffMember } from '@/types/game';

export function StaffAvatar({ member, className = 'w-9 h-9' }: { member: StaffMember; className?: string }) {
  const [imgFailed, setImgFailed] = useState(false);
  const initials = member.name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('');
  const showPhoto = member.photo != null && !imgFailed;
  return (
    <div
      className={`${className} shrink-0 rounded-lg overflow-hidden bg-white/5 border border-white/10 flex items-center justify-center`}
    >
      {showPhoto ? (
        <img
          src={member.photo!}
          alt={member.name}
          className="w-full h-full object-cover"
          onError={() => setImgFailed(true)}
        />
      ) : (
        <span className="text-[11px] font-semibold text-runway-300">{initials}</span>
      )}
    </div>
  );
}

export default StaffAvatar;