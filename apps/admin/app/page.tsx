import { Activity, CreditCard, Server, Users } from 'lucide-react';
import { GlassCard } from '../components/card';

const stats = [
  { label: 'Revenue', value: '128M Toman', icon: CreditCard },
  { label: 'Active users', value: '2,840', icon: Users },
  { label: 'Active services', value: '1,327', icon: Server },
  { label: 'Traffic used', value: '42.7 TB', icon: Activity },
];

export default function DashboardPage() {
  return (
    <main className="min-h-screen px-6 py-8 lg:px-12">
      <section className="mx-auto max-w-7xl space-y-8">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="text-sm uppercase tracking-[0.45em] text-indigo-300">V2 Bot Platform</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight md:text-6xl">Operations cockpit</h1>
            <p className="mt-4 max-w-2xl text-slate-300">
              A minimal, dark-mode friendly command center for users, wallet operations, products, Xray clients, tickets, and audit logs.
            </p>
          </div>
          <button className="rounded-2xl bg-indigo-400 px-5 py-3 font-medium text-slate-950 transition hover:bg-indigo-300">
            Create product
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {stats.map((stat) => (
            <GlassCard key={stat.label}>
              <stat.icon className="mb-6 h-6 w-6 text-indigo-300" />
              <p className="text-sm text-slate-400">{stat.label}</p>
              <p className="mt-2 text-3xl font-semibold">{stat.value}</p>
            </GlassCard>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
          <GlassCard>
            <h2 className="text-xl font-semibold">Recent purchases</h2>
            <div className="mt-6 space-y-4">
              {['Premium VMess', 'VIP VLESS', 'Streaming Reality'].map((item, index) => (
                <div key={item} className="flex items-center justify-between rounded-2xl bg-white/[0.04] p-4">
                  <div>
                    <p className="font-medium">{item}</p>
                    <p className="text-sm text-slate-400">User #{1200 + index} · {20 + index * 10}GB</p>
                  </div>
                  <span className="text-emerald-300">Succeeded</span>
                </div>
              ))}
            </div>
          </GlassCard>
          <GlassCard>
            <h2 className="text-xl font-semibold">Security posture</h2>
            <ul className="mt-6 space-y-3 text-sm text-slate-300">
              <li>• RBAC-protected admin actions</li>
              <li>• Immutable wallet ledger</li>
              <li>• Idempotent payment and purchase flow</li>
              <li>• Audit logs for sensitive operations</li>
            </ul>
          </GlassCard>
        </div>
      </section>
    </main>
  );
}
