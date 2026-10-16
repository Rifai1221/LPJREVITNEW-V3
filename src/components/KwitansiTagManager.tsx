import React, { useState, useRef, useEffect } from 'react';
import { Tag, Plus, X, ShieldCheck, Check, Sparkles, HelpCircle } from 'lucide-react';
import {
  STANDARD_KWITANSI_TAGS,
  getTagDefinition,
  getItemTags,
  addTagToItem,
  removeTagFromItem,
  isAhspLaborComponent,
} from '../utils/kwitansiTagHelper';
import { RabSubItem } from '../types';

interface KwitansiTagManagerProps {
  tags?: string[];
  onChangeTags: (newTags: string[]) => void;
  size?: 'sm' | 'xs';
  readOnly?: boolean;
  className?: string;
  itemHint?: Partial<RabSubItem>;
}

export const KwitansiTagManager: React.FC<KwitansiTagManagerProps> = ({
  tags = [],
  onChangeTags,
  size = 'xs',
  readOnly = false,
  className = '',
  itemHint,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [customTagInput, setCustomTagInput] = useState('');
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close popover on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const activeTags =
    tags && tags.length > 0
      ? tags
      : itemHint
      ? getItemTags(itemHint)
      : [];

  const handleToggleTag = (tagCode: string) => {
    const isPresent = activeTags.some((t) => t.toLowerCase() === tagCode.toLowerCase());
    if (isPresent) {
      onChangeTags(removeTagFromItem(activeTags, tagCode));
    } else {
      onChangeTags(addTagToItem(activeTags, tagCode));
    }
  };

  const handleAddCustomTag = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = customTagInput.trim().toUpperCase();
    if (!clean) return;
    onChangeTags(addTagToItem(activeTags, clean));
    setCustomTagInput('');
  };

  const handleRemoveTag = (e: React.MouseEvent, tagCode: string) => {
    e.stopPropagation();
    onChangeTags(removeTagFromItem(activeTags, tagCode));
  };

  return (
    <div className={`relative inline-flex items-center gap-1 flex-wrap ${className}`} ref={popoverRef}>
      {/* Active Tag Badges with Direct Delete Button */}
      {activeTags.map((tagCode) => {
        const def = getTagDefinition(tagCode);
        return (
          <span
            key={tagCode}
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md font-bold border transition shadow-2xs select-none ${
              def.badgeBg
            } ${def.badgeText} ${def.badgeBorder} ${size === 'xs' ? 'text-[9.5px]' : 'text-xs'}`}
            title={`${def.label}: ${def.description} (Kwitansi: ${def.noBuktiPrefix})`}
          >
            <span>{def.icon}</span>
            <span>{def.shortLabel}</span>
            {!readOnly && (
              <button
                type="button"
                onClick={(e) => handleRemoveTag(e, tagCode)}
                className="hover:bg-black/10 rounded-full p-0.5 ml-0.5 transition cursor-pointer text-slate-500 hover:text-rose-700"
                title={`Hapus tag ${def.label}`}
              >
                <X className="w-2.5 h-2.5" />
              </button>
            )}
          </span>
        );
      })}

      {/* Add Tag Button */}
      {!readOnly && (
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md font-semibold border transition cursor-pointer ${
            activeTags.length === 0
              ? 'bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-300 border-dashed'
              : 'bg-white hover:bg-slate-50 text-slate-500 border-slate-200'
          } ${size === 'xs' ? 'text-[9.5px]' : 'text-xs'}`}
          title="Tambah / Atur Tag Kwitansi untuk item ini"
        >
          <Plus className="w-2.5 h-2.5" />
          <span>{activeTags.length === 0 ? 'Tag Kwitansi' : 'Tag'}</span>
        </button>
      )}

      {/* Dropdown / Popover Selector */}
      {isOpen && !readOnly && (
        <div className="absolute left-0 top-full mt-1 z-50 w-72 bg-white rounded-xl shadow-xl border border-slate-200 p-3 text-slate-800 text-xs animate-in fade-in zoom-in-95 duration-100">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
            <div className="flex items-center gap-1.5 font-bold text-slate-800 text-xs">
              <Tag className="w-3.5 h-3.5 text-indigo-600" />
              <span>Pilih Tag Kwitansi</span>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="p-1 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <p className="text-[10px] text-slate-500 mb-2 leading-tight">
            Tag ini mengintegrasikan item langsung ke jenis kwitansi, bon toko, dan penomoran resmi yang tepat:
          </p>

          {/* List of 8 Standard Preset Tags */}
          <div className="grid grid-cols-2 gap-1.5 mb-3">
            {STANDARD_KWITANSI_TAGS.map((def) => {
              const isSelected = activeTags.some((t) => t.toLowerCase() === def.code.toLowerCase());
              return (
                <button
                  key={def.code}
                  type="button"
                  onClick={() => handleToggleTag(def.code)}
                  className={`flex items-center justify-between px-2 py-1.5 rounded-lg border text-left transition cursor-pointer text-[11px] ${
                    isSelected
                      ? `${def.badgeBg} ${def.badgeBorder} ${def.badgeText} font-bold ring-1 ring-indigo-400/30`
                      : 'bg-slate-50/80 hover:bg-slate-100 border-slate-200 text-slate-700'
                  }`}
                  title={`${def.label}: ${def.description}`}
                >
                  <span className="flex items-center gap-1 truncate">
                    <span>{def.icon}</span>
                    <span className="font-semibold truncate">{def.label}</span>
                  </span>
                  {isSelected && <Check className="w-3 h-3 shrink-0 ml-1 text-indigo-600" />}
                </button>
              );
            })}
          </div>

          {/* Custom Tag Input */}
          <form onSubmit={handleAddCustomTag} className="pt-2 border-t border-slate-100">
            <label className="block text-[10px] font-medium text-slate-600 mb-1">
              Tambah Tag Kustom (opsional):
            </label>
            <div className="flex items-center gap-1">
              <input
                type="text"
                placeholder="cth: TOKO-A, BANNER"
                value={customTagInput}
                onChange={(e) => setCustomTagInput(e.target.value)}
                className="flex-1 px-2 py-1 text-xs border border-slate-300 rounded-lg focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 uppercase"
              />
              <button
                type="submit"
                disabled={!customTagInput.trim()}
                className="px-2.5 py-1 text-xs font-bold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
              >
                +
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

/**
 * Special Protected Badge for Labor (UPAH) Components in AHSP
 * RULE: Labor/Upah in AHSP MUST NEVER be tagged as store material kwitansi.
 * Wages must always be paid via Weekly Wage Reports & UK receipt.
 */
export const AhspLaborProtectionBadge: React.FC<{
  uraian: string;
  kategori?: string;
}> = ({ uraian, kategori }) => {
  const isLabor = isAhspLaborComponent(uraian, kategori);
  if (!isLabor) return null;

  return (
    <div
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-900 border border-amber-300 select-none shadow-2xs"
      title="Upah Terlindungi: Hak upah tukang & pekerja dibayarkan 100% via Daftar Penerimaan Upah Mingguan (HOK / Borongan) dan Kwitansi Upah Kerja (UK). Tidak dialihkan ke Kwitansi Belanja Barang Toko."
    >
      <ShieldCheck className="w-3 h-3 text-amber-600 shrink-0" />
      <span>🛡️ Upah Terlindungi (Daftar Upah)</span>
    </div>
  );
};
