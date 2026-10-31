import { lazy, Suspense } from 'react';
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth.jsx';
import Layout from './components/Layout.jsx';
import { Loader, Empty } from './components/ui.jsx';
import Home from './pages/Home.jsx';
import { I18nProvider, t } from './i18n.jsx';

const page = (loader, name = 'default') => lazy(() => loader().then((m) => ({ default: m[name] })));

const Library = page(() => import('./pages/Library.jsx'));
const TextReader = page(() => import('./pages/TextReader.jsx'));
const Search = page(() => import('./pages/Search.jsx'));
const AIAssistant = page(() => import('./pages/AIAssistant.jsx'));
const Audio = page(() => import('./pages/Audio.jsx'));
const Presentations = page(() => import('./pages/Presentations.jsx'), 'Presentations');
const PresentationView = page(() => import('./pages/Presentations.jsx'), 'PresentationView');
const PdfLibrary = page(() => import('./pages/Pdfs.jsx'), 'PdfLibrary');
const PdfView = page(() => import('./pages/Pdfs.jsx'), 'PdfView');
const Bookmarks = page(() => import('./pages/Bookmarks.jsx'));
const Notes = page(() => import('./pages/Notes.jsx'));
const More = page(() => import('./pages/More.jsx'));
const About = page(() => import('./pages/Info.jsx'), 'About');
const Contact = page(() => import('./pages/Info.jsx'), 'Contact');
const Feedback = page(() => import('./pages/Info.jsx'), 'Feedback');
const HelpDesk = page(() => import('./pages/Info.jsx'), 'HelpDesk');
const Reviews = page(() => import('./pages/Reviews.jsx'));
const Archives = page(() => import('./pages/Archives.jsx'));
const Notifications = page(() => import('./pages/Notifications.jsx'));
const Dictionary = page(() => import('./pages/Dictionary.jsx'));
const OcrTool = page(() => import('./pages/OcrTool.jsx'));
const SlokaTool = page(() => import('./pages/Tools.jsx'), 'SlokaTool');
const TranslitTool = page(() => import('./pages/Tools.jsx'), 'TranslitTool');
const CitationTool = page(() => import('./pages/Tools.jsx'), 'CitationTool');
const TemplatesTool = page(() => import('./pages/Tools.jsx'), 'TemplatesTool');
const Forum = page(() => import('./pages/Forum.jsx'), 'Forum');
const ForumThread = page(() => import('./pages/Forum.jsx'), 'ForumThread');
const Events = page(() => import('./pages/Events.jsx'));
const Scholars = page(() => import('./pages/Scholars.jsx'), 'Scholars');
const ScholarProfile = page(() => import('./pages/Scholars.jsx'), 'ScholarProfile');
const Profile = page(() => import('./pages/Profile.jsx'));
const LearningPath = page(() => import('./pages/LearningPath.jsx'));
const Plans = page(() => import('./pages/Plans.jsx'));
const Login = page(() => import('./pages/Auth.jsx'), 'Login');
const Register = page(() => import('./pages/Auth.jsx'), 'Register');
const Admin = page(() => import('./admin/Admin.jsx'));
const TextPdf = page(() => import('./pages/TextPdf.jsx'));
const Classes = page(() => import('./pages/Classes.jsx'), 'Classes');
const ClassView = page(() => import('./pages/Classes.jsx'), 'ClassView');
const JoinClass = page(() => import('./pages/Classes.jsx'), 'JoinClass');
const FacultyDesk = page(() => import('./pages/Classes.jsx'), 'FacultyDesk');
const FacultyArticles = page(() => import('./pages/Articles.jsx'), 'FacultyArticles');
const Shop = page(() => import('./pages/Shop.jsx'), 'Shop');
const ProductView = page(() => import('./pages/Shop.jsx'), 'ProductView');
const VendorStore = page(() => import('./pages/Shop.jsx'), 'VendorStore');
const VendorPanel = page(() => import('./pages/Shop.jsx'), 'VendorPanel');

/** Routes that need a logged-in user redirect to /login and come back afterwards. */
function Private({ children, staff = false }) {
  const { user, loading, isStaff } = useAuth();
  const location = useLocation();
  if (loading) return <Loader />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  if (staff && !isStaff) return <Empty icon="bi-shield-lock" title="Access denied">{t('The admin panel is only for administrators and editors.')}</Empty>;
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <I18nProvider>
        <Suspense fallback={<Loader />}>
          <Routes>
            <Route path="/admin/*" element={<Private staff><Admin /></Private>} />
            <Route path="/text/:id/pdf" element={<TextPdf />} />
            <Route element={<Layout />}>
              <Route index element={<Home />} />
              <Route path="library" element={<Library />} />
              <Route path="text/:id" element={<TextReader />} />
              <Route path="search" element={<Search />} />
              <Route path="ai" element={<AIAssistant />} />
              <Route path="audio" element={<Audio />} />
              <Route path="presentations" element={<Presentations />} />
              <Route path="presentations/:id" element={<PresentationView />} />
              <Route path="pdfs" element={<PdfLibrary />} />
              <Route path="pdfs/:id" element={<PdfView />} />
              <Route path="bookmarks" element={<Private><Bookmarks /></Private>} />
              <Route path="notes" element={<Private><Notes /></Private>} />
              <Route path="more" element={<More />} />
              <Route path="about" element={<About />} />
              <Route path="contact" element={<Contact />} />
              <Route path="feedback" element={<Feedback />} />
              <Route path="helpdesk" element={<HelpDesk />} />
              <Route path="reviews" element={<Reviews />} />
              <Route path="archives" element={<Archives />} />
              <Route path="notifications" element={<Private><Notifications /></Private>} />
              <Route path="dictionary" element={<Dictionary />} />
              <Route path="dictionary/:slug" element={<Dictionary />} />
              <Route path="tools/ocr" element={<OcrTool />} />
              <Route path="tools/sloka" element={<SlokaTool />} />
              <Route path="tools/transliterate" element={<TranslitTool />} />
              <Route path="tools/citation" element={<CitationTool />} />
              <Route path="tools/templates" element={<TemplatesTool />} />
              <Route path="forum" element={<Forum />} />
              <Route path="forum/:id" element={<ForumThread />} />
              <Route path="events" element={<Events />} />
              <Route path="scholars" element={<Scholars />} />
              <Route path="scholars/:id" element={<ScholarProfile />} />
              <Route path="profile" element={<Private><Profile /></Private>} />
              <Route path="learning-path" element={<Private><LearningPath /></Private>} />
              <Route path="classes" element={<Private><Classes /></Private>} />
              <Route path="classes/join/:code" element={<Private><JoinClass /></Private>} />
              <Route path="classes/:id" element={<Private><ClassView /></Private>} />
              <Route path="faculty" element={<Private><FacultyDesk /></Private>} />
              <Route path="faculty/articles" element={<Private><FacultyArticles /></Private>} />
              <Route path="shop" element={<Shop />} />
              <Route path="shop/:id" element={<ProductView />} />
              <Route path="shop/vendor/:id" element={<VendorStore />} />
              <Route path="vendor" element={<Private><VendorPanel /></Private>} />
              <Route path="plans" element={<Plans />} />
              <Route path="login" element={<Login />} />
              <Route path="register" element={<Register />} />
              <Route path="*" element={<Empty icon="bi-signpost" title="Page not found"><Link to="/">{t('Go to home')}</Link></Empty>} />
            </Route>
          </Routes>
        </Suspense>
        </I18nProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
