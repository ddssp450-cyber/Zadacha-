import React from 'react';
import { 
  Building2, 
  LayoutDashboard, 
  Home, 
  CreditCard, 
  Wrench, 
  Calendar as CalendarIcon, 
  Cpu, 
  Receipt, 
  Sparkles, 
  UserCheck, 
  ChevronDown,
  Camera,
  LogOut,
  UserPlus,
  ShieldCheck
} from 'lucide-react';
import { Building, UserProfile, UserRole } from '../types';
import { Logo } from './Drawing';
import { BuildingFields, BuildingFormModal } from './BuildingAdmin';

interface NavbarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  currentUser: UserProfile | null;
  setCurrentUser: (user: UserProfile) => void;
  openAiChat: () => void;
  onOpenDiagnosisModal: () => void;
  onLogout: () => void;
  onOpenAuthModal?: () => void;
  allUsers: UserProfile[];
  // Site admin: gets the extra "Админ" tab
  isAdmin?: boolean;
  buildings: Building[];
  activeBuilding: Building;
  onSwitchBuilding: (buildingId: string) => void;
  // Absent for accounts that may not create buildings (only owners can).
  onCreateBuilding?: (fields: BuildingFields) => Promise<unknown>;
  onClaimBuildingByIdentifier?: (identifier: string) => Promise<number>;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentTab,
  setCurrentTab,
  currentUser,
  setCurrentUser,
  openAiChat,
  onOpenDiagnosisModal,
  onLogout,
  onOpenAuthModal,
  allUsers,
  isAdmin,
  buildings,
  activeBuilding,
  onSwitchBuilding,
  onCreateBuilding,
  onClaimBuildingByIdentifier,
}) => {
  const [isNewBuildingOpen, setIsNewBuildingOpen] = React.useState(false);
  const [isJoinBuildingOpen, setIsJoinBuildingOpen] = React.useState(false);
  const [joinIdentifier, setJoinIdentifier] = React.useState('');
  const [joinError, setJoinError] = React.useState<string | null>(null);
  const [joinBusy, setJoinBusy] = React.useState(false);
  const [isRoleDropdownOpen, setIsRoleDropdownOpen] = React.useState(false);

  const isTenant = currentUser?.role === 'tenant';

  const tenantNavItems = [
    { id: 'dashboard', label: 'Днес', icon: LayoutDashboard },
    { id: 'payments', label: 'Наем и сметки', icon: CreditCard },
    { id: 'repairs', label: 'Подай сигнал', icon: Wrench },
    { id: 'appliances', label: 'Моите уреди', icon: Home },
  ];

  const fullNavItems = [
    { id: 'dashboard', label: 'Днес', icon: LayoutDashboard },
    { id: 'buildings', label: 'Сграда', icon: Home },
    { id: 'payments', label: 'Плащания', icon: CreditCard },
    { id: 'repairs', label: 'Ремонти', icon: Wrench },
    { id: 'calendar', label: 'Календар', icon: CalendarIcon },
    { id: 'appliances', label: 'Уреди', icon: Cpu },
    { id: 'expenses', label: 'Разходи', icon: Receipt },
  ];

  // Builders and craftsmen get no finances; the server returns none to them either.
  const noFinances = currentUser?.role === 'builder' || currentUser?.role === 'craftsman';
  const roleNavItems = isTenant
    ? tenantNavItems
    : fullNavItems.filter((item) => !(noFinances && (item.id === 'payments' || item.id === 'expenses')));
  const navItems = isAdmin ? [...roleNavItems, { id: 'admin', label: 'Админ', icon: ShieldCheck }] : roleNavItems;

  const getRoleBadgeLabel = (role: UserRole) => {
    switch (role) {
      case 'owner': return 'Собственик';
      case 'tenant': return 'Наемател';
      case 'builder': return 'Строител';
      case 'craftsman': return 'Майстор';
      // Unknown values (old rows, AI output) must not crash the page
      default: return String(role ?? '—');
    }
  };

  const getRoleColor = (role: UserRole) => {
    switch (role) {
      case 'owner': return 'text-ink bg-raise border-ochre';
      case 'tenant': return 'text-mat bg-mat-soft border-mat';
      case 'builder': return 'text-stamp bg-raise border-stamp';
      case 'craftsman': return 'text-ink bg-raise border-line';
      // Unknown values (old rows, AI output) must not crash the page
      default: return 'text-ink bg-sheet px-1.5 py-0.5 rounded border border-line';
    }
  };

  return (
    <header className="mat sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-2 sm:gap-4 h-16">
          {/* Zone 1: Single text element wordmark with Sofia Enamel Plate badge */}
          <button 
            onClick={() => setCurrentTab('dashboard')}
            className="flex min-w-0 items-center gap-2.5 text-left group whitespace-nowrap overflow-hidden focus:outline-none"
          >
            <Logo className="w-8 h-8 shrink-0 text-white" />
            <div>
              <span className="font-tech text-[15px] tracking-[0.1em] text-white flex items-center gap-1.5">
                <span className="hidden sm:inline">BUILDING BRAIN</span>
                {isTenant && (
                  <span className="font-sans text-[11px] font-semibold tracking-normal text-ink bg-hi px-1.5 py-0.5 rounded">
                    Ап. {currentUser?.apartmentNumber ?? ''}
                  </span>
                )}
              </span>
            </div>
          </button>
          <select
            aria-label="Сграда"
            value={activeBuilding.id}
            onChange={(e) => (e.target.value === '__new' ? setIsNewBuildingOpen(true) : onSwitchBuilding(e.target.value))}
            className="min-w-0 max-w-[120px] sm:max-w-[200px] truncate bg-transparent text-[11.5px] text-[#b9cdbf] hover:text-white border border-white/25 rounded px-1.5 py-1 shrink-0"
          >
            {buildings.map((b) => (
              <option key={b.id} value={b.id} className="text-ink">{b.name}</option>
            ))}
            {onCreateBuilding && <option value="__new" className="text-ink">+ Нова сграда…</option>}
          </select>
          {isNewBuildingOpen && onCreateBuilding && <BuildingFormModal onSave={onCreateBuilding} onClose={() => setIsNewBuildingOpen(false)} />}
          {isJoinBuildingOpen && onClaimBuildingByIdentifier && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/45">
              <div role="dialog" aria-label="Присъединяване към сграда" className="w-full max-w-md rounded-2xl bg-sheet border border-line p-6 space-y-4 text-xs">
                <h3 className="text-base font-bold text-ink">Присъедини се към нова сграда</h3>
                <p className="text-mute leading-relaxed">
                  Ако друг собственик те е добавил като наемател, майстор или строител, въведи имейла, телефона или името, под което си записан.
                </p>
                <form
                  className="space-y-3"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setJoinError(null);
                    if (!joinIdentifier.trim()) return;
                    setJoinBusy(true);
                    try {
                      const count = await onClaimBuildingByIdentifier(joinIdentifier.trim());
                      if (count === 0) {
                        setJoinError('Не намерихме нова сграда с тези данни.');
                      } else {
                        setJoinIdentifier('');
                        setIsJoinBuildingOpen(false);
                      }
                    } catch (err) {
                      setJoinError(err instanceof Error ? err.message : 'Грешка при търсене на сграда.');
                    } finally {
                      setJoinBusy(false);
                    }
                  }}
                >
                  <input
                    className="w-full px-3 py-2 bg-raise border border-rule rounded-lg text-ink"
                    value={joinIdentifier}
                    onChange={(e) => setJoinIdentifier(e.target.value)}
                    placeholder="Телефон, име или имейл…"
                    required
                  />
                  {joinError && <p className="text-red">{joinError}</p>}
                  <div className="flex justify-end gap-2 pt-2 border-t border-line">
                    <button
                      type="button"
                      onClick={() => {
                        setIsJoinBuildingOpen(false);
                        setJoinError(null);
                      }}
                      className="px-4 py-2 text-mute hover:text-ink"
                    >
                      Отказ
                    </button>
                    <button
                      type="submit"
                      disabled={joinBusy || !joinIdentifier.trim()}
                      className="px-4 py-2 font-semibold text-white bg-mat hover:bg-mat-deep rounded-lg disabled:opacity-40"
                    >
                      {joinBusy ? 'Търсене…' : 'Намери сграда'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Zone 3: Camera, AI Trigger & User Profile */}
          <div className="flex items-center gap-2.5 shrink-0">
            {/* Phone Camera Damage Diagnosis Button - Enamel Blue Details */}
            <button
              onClick={onOpenDiagnosisModal}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-ink bg-hi hover:bg-[#e8d53a] rounded-lg transition-colors whitespace-nowrap shrink-0"
              title="Снимай повредата и асистентът ще прецени какво е"
            >
              <Camera className="w-3.5 h-3.5" aria-hidden />
              <span className="hidden sm:inline">Снимай повреда</span>
            </button>

            {/* AI Assistant Button - Sage Greenish with White text */}
            <button
              onClick={openAiChat}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white border border-white/40 hover:bg-white/10 rounded-lg transition-colors whitespace-nowrap shrink-0"
              title="Питай асистента"
            >
              <Sparkles className="w-3.5 h-3.5" aria-hidden />
              <span className="hidden md:inline">Асистент</span>
            </button>

            {/* Profile Menu or Login Button */}
            {!currentUser ? (
              <button
                onClick={onOpenAuthModal}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-raise hover:bg-hi-soft text-ink border border-ochre text-xs font-semibold shadow-sm transition-all"
              >
                <UserPlus className="w-3.5 h-3.5 text-stamp" />
                <span className="text-ink">Вход / Регистрация</span>
              </button>
            ) : (
              <div className="relative">
                <button
                  onClick={() => setIsRoleDropdownOpen(!isRoleDropdownOpen)}
                  className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-white/10 text-left transition-colors whitespace-nowrap shrink-0"
                >
                  <span className="grid w-7 h-7 place-items-center rounded-full bg-sheet font-tech text-[11px] text-mat" aria-hidden>
                    {currentUser.name.split(' ').map((w) => w[0]).slice(0, 2).join('')}
                  </span>
                  <div className="hidden sm:block text-left">
                    <div className="max-w-[160px] truncate text-xs font-semibold text-white leading-tight">
                      {currentUser.name}
                    </div>
                    <div className="text-[10px] text-ink flex items-center gap-1">
                      <span className={`px-1 rounded border text-[9px] font-tech ${getRoleColor(currentUser.role)}`}>
                        {getRoleBadgeLabel(currentUser.role)}
                      </span>
                    </div>
                  </div>
                  <ChevronDown className="w-3.5 h-3.5 text-[#b9cdbf] ml-0.5" />
                </button>

                {isRoleDropdownOpen && (
                  <>
                    <div 
                      className="fixed inset-0 z-30" 
                      onClick={() => setIsRoleDropdownOpen(false)} 
                    />
                    <div className="absolute right-0 mt-2 w-72 rounded-xl bg-sheet border border-line z-40 p-2 text-xs">
                      <div className="px-2.5 py-2 border-b border-line space-y-0.5">
                        <div className="text-xs font-semibold text-ink truncate">{currentUser.name}</div>
                        <div className="text-[11px] text-mute truncate">{currentUser.email}</div>
                        <div className="text-[10px] text-mat font-medium truncate">{currentUser.roleTitle}</div>
                      </div>

                      <div className="mt-1.5 space-y-1">
                        {onClaimBuildingByIdentifier && (
                          <button
                            onClick={() => {
                              setIsRoleDropdownOpen(false);
                              setIsJoinBuildingOpen(true);
                            }}
                            className="w-full flex items-center gap-2 px-2.5 py-2 text-xs text-mat hover:bg-mat-soft rounded-lg transition-colors font-medium"
                          >
                            <Building2 className="w-3.5 h-3.5" />
                            <span>Присъедини се към сграда</span>
                          </button>
                        )}
                        {onOpenAuthModal && (
                          <button
                            onClick={() => {
                              setIsRoleDropdownOpen(false);
                              onOpenAuthModal();
                            }}
                            className="w-full flex items-center gap-2 px-2.5 py-2 text-xs text-ink hover:bg-raise rounded-lg transition-colors font-medium"
                          >
                            <UserPlus className="w-3.5 h-3.5" />
                            <span>Смени профил</span>
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setIsRoleDropdownOpen(false);
                            onLogout();
                          }}
                          className="w-full flex items-center gap-2 px-2.5 py-2 text-xs text-red hover:bg-red/30 rounded-lg transition-colors font-medium"
                        >
                          <LogOut className="w-3.5 h-3.5" />
                          <span>Изход от профила</span>
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Tabs get their own row and wrap instead of scrolling or clipping */}
        <nav className="flex flex-wrap items-center gap-1 py-2 border-t border-white/15">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setCurrentTab(item.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`menu-plate flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium whitespace-nowrap shrink-0 ${
                  isActive ? 'menu-plate-active font-semibold' : ''
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {item.label}
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
};
