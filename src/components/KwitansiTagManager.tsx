import React, { useState, useRef, useEffect } from 'react';
import { Tag, Plus, X, ShieldCheck, Check, Sparkles, HelpCircle, Store } from 'lucide-react';
import {
  STANDARD_KWITANSI_TAGS,
  getTagDefinition,
  getItemTags,
  addTagToItem,
  removeTagFromItem,
  isAhspLaborComponent,
} from '../utils/kwitansiTagHelper';
import { RabSubItem, StoreVendor } from '../types';

interface KwitansiTagManagerProps {
  tags?: string[];
  onChangeTags: (newTags: string[]) => void;
  size?: 'sm' | 'xs';
  readOnly?: boolean;
  className?: string;
  itemHint?: Partial<RabSubItem>;
  stores?: StoreVendor[];
}

export const KwitansiTagManager: React.FC<KwitansiTagManagerProps> = ({
  tags = [],
  onChangeTags,
  size = 'xs',
  readOnly = false,
  className = '',
  itemHint,
  stores = [],
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

  // If labor component, strictly display paid to workers badge
  const isLabor = itemHint && isAhspLaborComponent(itemHint.uraian, itemHint.kategoriBiaya);
  if (isLabor) {
    return (
      <span
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md font-bold border bg-purple-50 text-purple-800 border-purple-300 ${
          size === 'xs' ? 'text-[9.5px]' : 'text-xs'
        } ${className}`}
        title="Komponen upah tenaga kerja dibayarkan langsung kepada pekerja melalui Daftar Upah Mingguan"
      >
        <span>👷</span>
        <span>Upah (Ke Pekerja)</span>
      </span>
    );
  }

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
        const matchingStore = stores.find((s) => s.namaToko.toLowerCase() === tagCode.toLowerCase());
        const badgeLabel = matchingStore ? matchingStore.namaToko : def.shortLabel;
        const badgeIcon = matchingStore ? '🛒' : def.icon;
        const badgeTitle = matchingStore ? `Toko Tujuan: ${matchingStore.namaToko} (${matchingStore.pemilikNama})` : `${def.label}: ${def.description}`;

        return (
          <span
            key={tagCode}
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md font-bold border transition shadow-2xs select-none ${
              matchingStore ? 'bg-indigo-50 text-indigo-900 border-indigo-300' : `${def.badgeBg} ${def.badgeText} ${def.badgeBorder}`
            } ${size === 'xs' ? 'text-[9.5px]' : 'text-xs'}`}
            title={badgeTitle}
          >
            <span>{badgeIcon}</span>
            <span className="max-w-[110px] truncate">{badgeLabel}</span>
            {!readOnly && (
              <button
                type="button"
                onClick={(e) => handleRemoveTag(e, tagCode)}
                className="hover:bg-black/10 rounded-full p-0.5 ml-0.5 transition cursor-pointer text-slate-500 hover:text-rose-700"
                title={`Hapus tag`}
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
          title="Tambah / Atur Tag Kwitansi / Toko Tujuan"
        >
          <Plus className="w-2.5 h-2.5" />
          <span>{activeTags.length === 0 ? 'Tag Toko' : 'Tag'}</span>
        </button>
      )}

      {/* Dropdown / Popover Selector */}
      {isOpen && !readOnly && (
        <div className="absolute left-0 top-full mt-1 z-50 w-80 bg-white rounded-xl shadow-xl border border-slate-200 p-3 text-slate-800 text-xs animate-in fade-in zoom-in-95 duration-100">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
            <div className="flex items-center gap-1.5 font-bold text-slate-800 text-xs">
              <Tag className="w-3.5 h-3.5 text-indigo-600" />
              <span>Pilih Toko Tujuan & Tag Kwitansi</span>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="p-1 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Dynamic Store Vendors Section */}
          {stores && stores.length > 0 && (
            <div className="mb-3">
              <div className="flex items-center gap-1 text-[10px] font-bold text-indigo-700 uppercase tracking-wide mb-1.5">
                <Store className="w-3 h-3" />
                <span>Toko Rekanan & Penyedia (Master):</span>
              </div>
              <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
                {stores.map((store) => {
                  const isSelected = activeTags.some((t) => t.toLowerCase() === store.namaToko.toLowerCase());
                  return (
                    <button
                      key={store.id}
                      type="button"
                      onClick={() => handleToggleTag(store.namaToko)}
                      className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg border text-left transition cursor-pointer text-[11px] ${
                        isSelected
                          ? 'bg-indigo-50 border-indigo-300 text-indigo-900 font-bold ring-1 ring-indigo-400/30'
                          : 'bg-slate-50/80 hover:bg-slate-100 border-slate-200 text-slate-700'
                      }`}
                      title={`${store.namaToko} - ${store.pemilikNama} (${store.kategori})`}
                    >
                      <div className="flex items-center gap-1.5 truncate">
                        <span>🛒</span>
                        <div className="truncate">
                          <span className="font-semibold">{store.namaToko}</span>
                          <span className="text-[10px] text-slate-500 block truncate">{store.pekerjaan || store.kategori} • {store.alamat}</span>
                        </div>
                      </div>
                      {isSelected && <Check className="w-3.5 h-3.5 shrink-0 ml-1 text-indigo-600" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1.5 pt-2 border-t border-slate-100">
            Kategori Standar Kwitansi:
          </div>

          {/* List of Standard Preset Tags */}
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
                    <span className="font-semibold truncate">{def.shortLabel}</span>
                  </span>
                  {isSelected && <Check className="w-3 h-3 shrink-0 ml-1 text-indigo-600" />}
                </button>
              );
            })}
          </div>

          {/* Custom Tag Input */}
          <form onSubmit={handleAddCustomTag} className="pt-2 border-t border-slate-100">
            <label className="block text-[10px] font-medium text-slate-600 mb-1">
              Tambah Tag / Toko Kustom:
            </label>
            <div className="flex items-center gap-1">
              <input
                type="text"
                placeholder="cth: TOKO ABC"
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
