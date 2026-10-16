// Proposal Maker — reusable inline-editing primitives for the editable
// proposal document (ProposalEditor.tsx). Plain contentEditable, no rich-text
// engine: every value round-trips as plain text/number, which is all a sales
// proposal's fields need and what stays clean through PDF/Word export.
import React, { useEffect, useRef } from "react";
import { Plus, Trash2, Upload } from "lucide-react";

// ─── EditableText — inline text/paragraph, commits on blur ─────────────────
interface EditableTextProps {
  value: string;
  onChange: (v: string) => void;
  as?: "span" | "div" | "p" | "td" | "th";
  className?: string;
  multiline?: boolean;
}
export function EditableText({ value, onChange, as = "span", className = "", multiline }: EditableTextProps) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el && document.activeElement !== el && el.textContent !== value) el.textContent = value;
  }, [value]);
  const As = as as any;
  return (
    <As
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      className={`eb-editable ${className}`}
      style={multiline ? { whiteSpace: "pre-wrap" } : undefined}
      onBlur={(e: React.FocusEvent<HTMLElement>) => {
        const text = e.currentTarget.textContent || "";
        if (text !== value) onChange(text);
      }}
    />
  );
}

// ─── EditableList — bullet/numbered list with add / delete ─────────────────
interface EditableListProps {
  items: string[];
  onChange: (items: string[]) => void;
  ordered?: boolean;
  className?: string;
  addLabel?: string;
}
export function EditableList({ items, onChange, ordered, className = "", addLabel = "Add item" }: EditableListProps) {
  const Tag = ordered ? "ol" : "ul";
  return (
    <Tag className={`eb-list ${className}`}>
      {items.map((item, idx) => (
        <li key={idx} className="eb-list-item">
          <EditableText
            as="span"
            value={item}
            onChange={(v) => onChange(items.map((it, i) => (i === idx ? v : it)))}
          />
          <button type="button" className="eb-list-del no-print" title="Remove" onClick={() => onChange(items.filter((_, i) => i !== idx))}>
            <Trash2 className="w-3 h-3" />
          </button>
        </li>
      ))}
      <button type="button" className="eb-list-add no-print" onClick={() => onChange([...items, "New item"])}>
        <Plus className="w-3 h-3" /> {addLabel}
      </button>
    </Tag>
  );
}

// ─── EditableTable — generic add-row / delete-row / per-cell edit table ────
export interface EditableColumn<T> {
  key: keyof T;
  label: string;
  width?: string;
  align?: "left" | "right" | "center";
}
interface EditableTableProps<T> {
  columns: EditableColumn<T>[];
  rows: T[];
  onChange: (rows: T[]) => void;
  newRow: () => T;
  className?: string;
}
export function EditableTable<T extends Record<string, any>>({ columns, rows, onChange, newRow, className = "" }: EditableTableProps<T>) {
  const updateCell = (idx: number, key: keyof T, v: string) => {
    onChange(rows.map((r, i) => (i === idx ? { ...r, [key]: v } : r)));
  };
  return (
    <table className={`eb-table ${className}`}>
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={String(c.key)} style={c.width ? { width: c.width } : undefined}>
              {c.label}
            </th>
          ))}
          <th className="no-print eb-table-actions-col" />
        </tr>
      </thead>
      <tbody>
        {rows.map((row, idx) => (
          <tr key={idx}>
            {columns.map((c) => (
              <EditableText
                key={String(c.key)}
                as="td"
                className={c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : ""}
                value={String(row[c.key] ?? "")}
                onChange={(v) => updateCell(idx, c.key, v)}
              />
            ))}
            <td className="no-print eb-table-actions-col">
              <button type="button" className="eb-list-del" title="Delete row" onClick={() => onChange(rows.filter((_, i) => i !== idx))}>
                <Trash2 className="w-3 h-3" />
              </button>
            </td>
          </tr>
        ))}
      </tbody>
      <tfoot className="no-print">
        <tr>
          <td colSpan={columns.length + 1}>
            <button type="button" className="eb-list-add" onClick={() => onChange([...rows, newRow()])}>
              <Plus className="w-3 h-3" /> Add row
            </button>
          </td>
        </tr>
      </tfoot>
    </table>
  );
}

// ─── EditableImage — click to upload/replace, stored as dataURL ────────────
interface EditableImageProps {
  src: string;
  onChange: (dataUrl: string) => void;
  alt?: string;
  className?: string;
  imgClassName?: string;
}
export function EditableImage({ src, onChange, alt = "", className = "", imgClassName = "" }: EditableImageProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className={`eb-editable-image ${className}`} onClick={() => inputRef.current?.click()} title="Click to replace image">
      <img src={src} alt={alt} className={imgClassName} />
      <div className="eb-editable-image-hint no-print">
        <Upload className="w-4 h-4" />
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => onChange(String(reader.result));
          reader.readAsDataURL(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}
