interface ColorPickerProps {
  value: string
  onChange: (color: string) => void
}

const COLORS = [
  '#F97316', '#8B5CF6', '#EC4899', '#14B8A6',
  '#F59E0B', '#06B6D4', '#84CC16', '#EF4444',
  '#3B82F6', '#10B981', '#F43F5E', '#6366F1',
]

export function ColorPicker({ value, onChange }: ColorPickerProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {COLORS.map(color => (
        <button
          key={color}
          type="button"
          onClick={() => onChange(color)}
          className="w-8 h-8 rounded-full transition-transform active:scale-90"
          style={{ backgroundColor: color, 
            outline: value === color ? `3px solid ${color}` : 'none',
            outlineOffset: '2px',
          }}
        />
      ))}
    </div>
  )
}
