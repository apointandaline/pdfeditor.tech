import { Navbar } from '../components/Navbar';
import EditorApp from '../App';

export function EditorPage() {
  return (
    <div className="editor-page">
      <Navbar />
      <div className="editor-page__app">
        <EditorApp />
      </div>
    </div>
  );
}
