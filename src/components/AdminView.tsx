import React, { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { DeleteButton } from './PhotoPicker';
import {
  AdminOverviewData,
  deleteBuildingCascade,
  deleteUserAsAdmin,
  fetchAdminOverview,
} from '../lib/dataStore';

const ROLE_BG: Record<string, string> = {
  admin: 'Администратор',
  owner: 'Собственик',
  tenant: 'Наемател',
  builder: 'Строител',
  craftsman: 'Майстор',
  user: 'Потребител',
};

export const AdminView: React.FC<{ currentUserId: string; onChanged?: () => void }> = ({ currentUserId, onChanged }) => {
  const [data, setData] = useState<AdminOverviewData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setError(null);
    fetchAdminOverview()
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Грешка при зареждане.'));
  };

  useEffect(() => {
    load();
  }, []);

  const handleRemoveUser = (userId: string) =>
    deleteUserAsAdmin(userId)
      .then(() => {
        load();
        onChanged?.();
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Грешка при изтриване.'));

  const handleRemoveBuilding = (buildingId: string) =>
    deleteBuildingCascade(buildingId)
      .then(() => {
        load();
        onChanged?.();
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Грешка при изтриване.'));

  return (
    <div className="space-y-6 text-xs">
      <div>
        <h2 className="text-xl font-bold text-ink flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-mat" /> Админ панел
        </h2>
        <p className="text-mute mt-1">Всички потребители и сгради в Building Brain. Вижда се само от администратори.</p>
      </div>
      {error && (
        <p role="alert" className="text-red">
          {error}
        </p>
      )}
      {!data ? (
        <p className="text-mute">Зареждане…</p>
      ) : (
        <>
          <section className="rounded-2xl border border-line bg-sheet p-5 overflow-x-auto">
            <h3 className="text-sm font-bold text-ink mb-3">Потребители ({data.users.length})</h3>
            <table className="w-full text-left">
              <thead className="text-mute">
                <tr>
                  <th className="py-2 pr-3 font-medium">Име</th>
                  <th className="py-2 pr-3 font-medium">Имейл</th>
                  <th className="py-2 pr-3 font-medium">Роля</th>
                  <th className="py-2 pr-3 font-medium">Сгради</th>
                  <th className="py-2 pr-3 font-medium">Регистриран</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.users.map((u) => (
                  <tr key={u.id}>
                    <td className="py-2 pr-3 text-ink font-medium">{u.name}</td>
                    <td className="py-2 pr-3 text-ink">{u.email}</td>
                    <td className="py-2 pr-3 text-ink">{ROLE_BG[u.role] ?? u.role}</td>
                    <td className="py-2 pr-3 text-ink font-tech">{u.buildings}</td>
                    <td className="py-2 pr-3 text-mute font-tech">{new Date(u.createdAt).toLocaleDateString('bg-BG')}</td>
                    <td className="py-2 text-right">
                      {u.id !== currentUserId && (
                        <DeleteButton className="!px-2 !py-0.5 !text-[10px]" onDelete={() => handleRemoveUser(u.id)} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="rounded-2xl border border-line bg-sheet p-5 overflow-x-auto">
            <h3 className="text-sm font-bold text-ink mb-3">Сгради ({data.buildings.length})</h3>
            <table className="w-full text-left">
              <thead className="text-mute">
                <tr>
                  <th className="py-2 pr-3 font-medium">Сграда</th>
                  <th className="py-2 pr-3 font-medium">Град</th>
                  <th className="py-2 pr-3 font-medium">Собственик</th>
                  <th className="py-2 pr-3 font-medium">Хора</th>
                  <th className="py-2 pr-3 font-medium">Записи</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.buildings.map((b) => (
                  <tr key={b.id}>
                    <td className="py-2 pr-3 text-ink font-medium">{b.name}</td>
                    <td className="py-2 pr-3 text-ink">{b.city}</td>
                    <td className="py-2 pr-3 text-ink">{b.owners || '—'}</td>
                    <td className="py-2 pr-3 text-ink font-tech">{b.members}</td>
                    <td className="py-2 pr-3 text-ink font-tech">{b.records}</td>
                    <td className="py-2 text-right">
                      <DeleteButton className="!px-2 !py-0.5 !text-[10px]" onDelete={() => handleRemoveBuilding(b.id)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  );
};
