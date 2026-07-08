interface Item {
  id: string
  label: string
}

interface SearchableEntityPickerProps {
  label: string
  labelHint?: string
  selectedItems: Item[]
  onRemove: (id: string) => void
  searchResults: Item[]
  inputValue: string
  onInputChange: (value: string) => void
  onSelect: (id: string) => void
  showCreate?: boolean
  createLabel?: string
  onCreate?: () => void
  chipColor: string
  placeholder?: string
}

export function TagChip({ label, onRemove, chipColor }: { label: string; onRemove: () => void; chipColor: string }) {
  return (
    <span className={`flex items-center gap-1 px-2 py-1 ${chipColor} text-white text-xs rounded-full`}>
      {label}
      <button onClick={onRemove} className="hover:text-red-300">×</button>
    </span>
  )
}

export function SearchableEntityPicker({
  label,
  labelHint,
  selectedItems,
  onRemove,
  searchResults,
  inputValue,
  onInputChange,
  onSelect,
  showCreate,
  createLabel,
  onCreate,
  chipColor,
  placeholder = 'Search…',
}: SearchableEntityPickerProps) {
  const showDropdown = inputValue.trim().length > 0 && (searchResults.length > 0 || showCreate)

  return (
    <section className="flex flex-col gap-2">
      <span className="text-sm font-medium text-slate-300">
        {label}
        {labelHint && <span className="text-slate-500 font-normal"> ({labelHint})</span>}
      </span>
      <div className="flex flex-wrap gap-1.5">
        {selectedItems.map(item => (
          <TagChip key={item.id} label={item.label} onRemove={() => onRemove(item.id)} chipColor={chipColor} />
        ))}
      </div>
      <div className="relative">
        <input
          type="text"
          value={inputValue}
          onChange={e => onInputChange(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-slate-500"
        />
        {showDropdown && (
          <div className="absolute top-full mt-1 w-full bg-slate-700 rounded-lg shadow-lg z-10 overflow-hidden border border-slate-600">
            {searchResults.map(item => (
              <button
                key={item.id}
                onMouseDown={e => { e.preventDefault(); onSelect(item.id) }}
                className="w-full text-left px-3 py-2 text-sm text-white hover:bg-slate-600"
              >
                {item.label}
              </button>
            ))}
            {showCreate && createLabel && onCreate && (
              <button
                onMouseDown={e => { e.preventDefault(); onCreate() }}
                className="w-full text-left px-3 py-2 text-sm text-indigo-300 hover:bg-slate-600"
              >
                + Create "{createLabel}"
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
