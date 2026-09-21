import { HashRouter, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Home } from './pages/Home';
import { Bounties } from './pages/Bounties';
import { BountyDetailPage } from './pages/BountyDetail';
import { Create } from './pages/Create';
import { NewBounty } from './pages/NewBounty';
import { Submit } from './pages/Submit';
import { Evaluate } from './pages/Evaluate';
import { Decision } from './pages/Decision';
import { HowItWorks } from './pages/HowItWorks';

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="bounties" element={<Bounties />} />
          <Route path="bounties/new" element={<NewBounty />} />
          <Route path="bounties/:id" element={<BountyDetailPage />} />
          <Route path="bounties/:id/submit" element={<Submit />} />
          <Route path="bounties/:id/evaluate" element={<Evaluate />} />
          <Route path="create" element={<Create />} />
          <Route path="decisions/:id" element={<Decision />} />
          <Route path="how-it-works" element={<HowItWorks />} />
          <Route path="*" element={<Home />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
