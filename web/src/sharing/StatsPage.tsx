import type { ShareStats, ShareStatsDay } from '@nkzw/codiff-service/views';
import { ErrorBoundary } from 'react-error-boundary';
import { type ViewRef, useRequest, useView, view } from 'react-fate';
import { usePageTitle } from './utils.ts';
import ViewerError from './ViewerError.tsx';

const DayView = view<ShareStatsDay>()({
  date: true,
  id: true,
  plans: true,
  walkthroughs: true,
});
const StatsView = view<ShareStats>()({
  days: DayView,
  id: true,
  maxDailyShares: true,
  totalPlans: true,
  totalWalkthroughs: true,
});

const Content = ({ stats: statsRef }: { stats: ViewRef<'ShareStats'> }) => {
  const stats = useView(StatsView, statsRef);
  const number = new Intl.NumberFormat();
  return (
    <main className="codiff-web-page codiff-public-stats">
      <header>
        <h1>Codiff Usage</h1>
        <p>Public, unlisted shares on codiff.dev.</p>
      </header>
      <div className="codiff-public-stats-totals">
        <section>
          <strong>{number.format(stats.totalWalkthroughs)}</strong>
          <span>Walkthroughs</span>
        </section>
        <section>
          <strong>{number.format(stats.totalPlans)}</strong>
          <span>Plans</span>
        </section>
      </div>
      <section className="codiff-public-stats-days">
        {stats.days.map((dayRef) => (
          <Day day={dayRef} key={dayRef.id} />
        ))}
      </section>
    </main>
  );
};

const Day = ({ day: dayRef }: { day: ViewRef<'ShareStatsDay'> }) => {
  const day = useView(DayView, dayRef);
  return (
    <article>
      <time dateTime={day.date}>{day.date}</time>
      <span>{day.walkthroughs} walkthroughs</span>
      <span>{day.plans} plans</span>
    </article>
  );
};

const Screen = () => {
  const { sharingStats } = useRequest({ sharingStats: { view: StatsView } });
  return sharingStats ? <Content stats={sharingStats} /> : null;
};

export default function StatsPage() {
  usePageTitle('Usage');
  return (
    <ErrorBoundary
      fallbackRender={() => <ViewerError title="Unable to load sharing statistics." />}
    >
      <Screen />
    </ErrorBoundary>
  );
}
