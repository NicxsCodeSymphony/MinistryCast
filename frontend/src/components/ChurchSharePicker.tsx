type ChurchSharePickerProps = {
  churches: { id: string; name: string }[];
  value: string[];
  onChange: (ids: string[]) => void;
  label?: string;
  hint?: string;
};

export default function ChurchSharePicker({
  churches,
  value,
  onChange,
  label = "Churches that can view this",
  hint = "Select one or more. Those churches can open and keep using it.",
}: ChurchSharePickerProps) {
  if (!churches.length) return null;
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-on-surface-variant ml-1">{label}</p>
      <p className="text-[11px] text-on-surface-variant ml-1">{hint}</p>
      <div className="max-h-44 overflow-y-auto custom-scrollbar rounded-xl border border-white/10 bg-surface-container divide-y divide-white/5">
        {churches.map((church) => {
          const checked = value.includes(church.id);
          return (
            <label
              key={church.id}
              className="flex items-center gap-3 px-4 py-2.5 text-sm cursor-pointer hover:bg-white/5"
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() =>
                  onChange(
                    checked
                      ? value.filter((id) => id !== church.id)
                      : [...value, church.id],
                  )
                }
                className="accent-primary"
              />
              <span className="truncate">{church.name}</span>
            </label>
          );
        })}
      </div>
      {value.length === 0 ? (
        <p className="text-[11px] text-[#ffb4ab] ml-1">Choose at least one church.</p>
      ) : (
        <p className="text-[11px] text-on-surface-variant ml-1">
          {value.length} selected
        </p>
      )}
    </div>
  );
}
