import { Building2, KeyRound, PlugZap, ShieldCheck, Table2, Users } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { Card, PageHeader } from '@/components/ui/Card';
import { Tabs, type TabItem } from '@/components/ui/Tabs';
import { Link } from 'react-router-dom';
import { MappingPanel } from './MappingPanel';
import { ProfilePanel } from './ProfilePanel';
import { SimkatmawaPanel } from './SimkatmawaPanel';
import { UsersPanel } from './UsersPanel';

type Tab = 'profil' | 'simkatmawa' | 'pemetaan' | 'pengguna' | 'keamanan';

export default function SettingsPage() {
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();

  const tabs: TabItem<Tab>[] = [
    { id: 'profil', label: 'Profil PT', icon: <Building2 className="size-4" aria-hidden /> },
    { id: 'simkatmawa', label: 'SIMKATMAWA', icon: <PlugZap className="size-4" aria-hidden /> },
    ...(can('record.read') ? [{ id: 'pemetaan' as const, label: 'Pemetaan kode', icon: <Table2 className="size-4" aria-hidden /> }] : []),
    ...(can('user.manage') ? [{ id: 'pengguna' as const, label: 'Pengguna', icon: <Users className="size-4" aria-hidden /> }] : []),
    { id: 'keamanan', label: 'Keamanan akun', icon: <ShieldCheck className="size-4" aria-hidden /> },
  ];
  const requested = params.get('tab') as Tab | null;
  const active: Tab = tabs.some((t) => t.id === requested) ? (requested as Tab) : 'profil';

  return (
    <>
      <PageHeader title="Pengaturan" description="Profil perguruan tinggi, koneksi SIMKATMAWA, pemetaan kode, dan akses pengguna." />
      <div className="mb-5">
        <Tabs label="Bagian pengaturan" items={tabs} value={active} onChange={(id) => setParams({ tab: id }, { replace: true })} />
      </div>
      <div role="tabpanel" id={`panel-${active}`} aria-labelledby={`tab-${active}`}>
        {active === 'profil' && <ProfilePanel />}
        {active === 'simkatmawa' && <SimkatmawaPanel />}
        {active === 'pemetaan' && <MappingPanel />}
        {active === 'pengguna' && <UsersPanel />}
        {active === 'keamanan' && (
          <Card className="space-y-4 p-6">
            <h2 className="text-base font-bold text-slate-900">Keamanan akun</h2>
            <ul className="list-disc space-y-1.5 pl-5 text-slate-700">
              <li>Sesi berakhir otomatis setelah 30 menit tanpa aktivitas dan maksimal 8 jam.</li>
              <li>Akun terkunci 15 menit setelah 5 kali salah kata sandi.</li>
              <li>Mengganti kata sandi mengeluarkan seluruh sesi lain.</li>
            </ul>
            <Link to="/ganti-sandi" className="inline-flex h-11 items-center gap-2 rounded-lg bg-brand-700 px-4 font-bold text-white hover:bg-brand-800">
              <KeyRound className="size-4" aria-hidden /> Ganti kata sandi
            </Link>
          </Card>
        )}
      </div>
    </>
  );
}
