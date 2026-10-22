// Small badges next to a name: CREATOR (pink/blue flow) and FOUNDER (gold flow, first 10 drivers).
export default function UserTags({ creator, founder, className = '' }) {
  if (!creator && !founder) return null;
  return (
    <span className={`inline-flex items-center gap-1 align-middle ${className}`}>
      {creator && <span className="dz-creator inline-block whitespace-nowrap text-[10px] font-black tracking-wider text-[#0b1020] rounded-full px-2 py-0.5 leading-none">CREATOR</span>}
      {founder && <span className="dz-founder inline-block whitespace-nowrap text-[10px] font-black tracking-wider text-[#2a1a00] rounded-full px-2 py-0.5 leading-none" title={`Founder #${founder} of 10`}>FOUNDER</span>}
    </span>
  );
}
