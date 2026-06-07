import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import './Dashboard.css';

function Dashboard() {
  const [user, setUser] = useState(null);
  const [lessons, setLessons] = useState([]); // 授業資料
  const [assignments, setAssignments] = useState([]); // 課題
  const [students, setStudents] = useState([]); // 生徒の一覧
  const [progresses, setProgresses] = useState([]); // 生徒の進捗状況
  const [activeAssignment, setActiveAssignment] = useState(null); // 現在取り組んでいる課題
  const [activeLesson, setActiveLesson] = useState(null); // 現在見ている授業資料
  const [activeTab, setActiveTab] = useState('home'); // サイドメニューの選択状態
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth > 768); // サイドバーの開閉状態
  const [isDarkMode, setIsDarkMode] = useState(() => localStorage.getItem('darkMode') === 'true'); // ダークモード状態
  const [newLesson, setNewLesson] = useState({ title: '', content: '', chapter_id: 1 });
  const [isEditingLesson, setIsEditingLesson] = useState(false);
  const [editingLessonData, setEditingLessonData] = useState({ title: '', content: '', chapter_id: 1 });
  const [newAssignment, setNewAssignment] = useState({ title: '', description: '', lesson_id: '', template_code: '', file: null });
  const [submitFile, setSubmitFile] = useState(null);
  const [selectedSubmitAssignment, setSelectedSubmitAssignment] = useState('');
  const [trashData, setTrashData] = useState(null); // ゴミ箱のデータ
  const navigate = useNavigate();

  // --- Toast（通知）用の状態管理 ---
  const [toast, setToast] = useState({ message: '', type: 'success', visible: false });
  const [toastTimeout, setToastTimeout] = useState(null);

  const showToast = (message, type = 'success') => {
    setToast({ message, type, visible: true });
    if (toastTimeout) {
      clearTimeout(toastTimeout);
    }
    const timeout = setTimeout(() => {
      setToast((prev) => ({ ...prev, visible: false }));
    }, 3000);
    setToastTimeout(timeout);
  };

  // --- タブ切り替えとモバイル用サイドバー制御 ---
  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    setActiveLesson(null);
    setActiveAssignment(null);
    if (window.innerWidth <= 768) {
      setIsSidebarOpen(false); // スマホの場合はメニューを選んだら自動で閉じる
    }
  };

  // --- 確認ダイアログ用の状態管理 ---
  const [confirmDialog, setConfirmDialog] = useState({ visible: false, message: '', onConfirm: null });

  // 進捗データを取得する共通関数
  const fetchProgresses = async () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    const apiUrl = import.meta.env.VITE_API_URL;
    try {
      const progressResponse = await axios.get(`${apiUrl}/progresses`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setProgresses(progressResponse.data);
    } catch (error) {
      console.error('進捗の取得に失敗しました', error);
      if (error.response && error.response.status === 401) {
        localStorage.removeItem('token');
        navigate('/');
      }
    }
  };

  // ゴミ箱データを取得する関数
  const fetchTrash = async () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    const apiUrl = import.meta.env.VITE_API_URL;
    try {
      const trashResponse = await axios.get(`${apiUrl}/trash`, { headers: { Authorization: `Bearer ${token}` } });
      setTrashData(trashResponse.data);
    } catch (error) {
      console.error('ゴミ箱の取得に失敗しました', error);
    }
  };

  const fetchData = async () => {
      const token = localStorage.getItem('token');
      if (!token) {
        navigate('/');
        return;
      }

      try {
        const apiUrl = import.meta.env.VITE_API_URL;
        // ユーザー情報の取得
        const userResponse = await axios.get(`${apiUrl}/users/me`, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });
        setUser(userResponse.data);

        // バックエンドのリファクタリング完了に伴う正規のエンドポイント呼び出し
        const lessonsResponse = await axios.get(`${apiUrl}/lessons`);
        const assignmentsResponse = await axios.get(`${apiUrl}/assignments`);
        
        setLessons(lessonsResponse.data);
        setAssignments(assignmentsResponse.data);

        // 教員の場合は生徒アカウントの一覧も取得する
        if (userResponse.data.role === 'teacher') {
          const studentsResponse = await axios.get(`${apiUrl}/users`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          setStudents(studentsResponse.data);
        }

        // 進捗状況の取得（教員・生徒共通）
        await fetchProgresses();
      } catch (error) {
        console.error('情報の取得に失敗しました', error);
        if (error.response && error.response.status === 401) {
          localStorage.removeItem('token');
          navigate('/');
        }
      }
    };

  const handleLogout = () => {
    localStorage.removeItem('token');
    navigate('/');
  };

  const toggleDarkMode = () => {
    const newMode = !isDarkMode;
    setIsDarkMode(newMode);
    localStorage.setItem('darkMode', newMode); // 次回開いた時も状態を記憶する
  };

  // --- 授業資料の作成 ---
  const handleCreateLesson = async (e) => {
    e.preventDefault();
    const token = localStorage.getItem('token');
    try {
      const apiUrl = import.meta.env.VITE_API_URL;
      const res = await axios.post(`${apiUrl}/lessons`, newLesson, { headers: { Authorization: `Bearer ${token}` } });
      setLessons([...lessons, res.data]);
      setNewLesson({ title: '', content: '', chapter_id: 1 });
      showToast('授業資料を作成しました！', 'success');
    } catch(e) {
      showToast('作成に失敗しました。', 'error');
    }
  };

  // --- 授業資料の更新 ---
  const handleUpdateLesson = async (e) => {
    e.preventDefault();
    const token = localStorage.getItem('token');
    try {
      const apiUrl = import.meta.env.VITE_API_URL;
      const res = await axios.put(`${apiUrl}/lessons/${activeLesson.id}`, editingLessonData, { headers: { Authorization: `Bearer ${token}` } });
      setActiveLesson(res.data);
      setLessons(lessons.map(l => l.id === res.data.id ? res.data : l));
      setIsEditingLesson(false);
      showToast('授業資料を更新しました！', 'success');
    } catch(e) {
      showToast('更新に失敗しました。', 'error');
    }
  };

  // --- 課題の作成（ファイル添付対応） ---
  const handleCreateAssignment = async (e) => {
    e.preventDefault();
    const token = localStorage.getItem('token');
    const formData = new FormData();
    formData.append('title', newAssignment.title);
    formData.append('description', newAssignment.description);
    if (newAssignment.file) formData.append('file', newAssignment.file);

    try {
      const apiUrl = import.meta.env.VITE_API_URL;
      const res = await axios.post(`${apiUrl}/assignments`, formData, { 
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' } 
      });
      setAssignments([...assignments, res.data]);
      setNewAssignment({ title: '', description: '', lesson_id: '', template_code: '', file: null });
      // input[type=file]の中身もクリア
      e.target.reset();
      showToast('課題を作成しました！生徒のダッシュボードに反映されました。', 'success');
    } catch(e) {
      showToast('作成に失敗しました。', 'error');
    }
  };

  const markLessonAsCompleted = async (lessonId) => {
    const token = localStorage.getItem('token');
    const apiUrl = import.meta.env.VITE_API_URL;
    try {
      await axios.post(`${apiUrl}/progresses`, {
        lesson_id: lessonId,
        status: '完了'
      }, { headers: { Authorization: `Bearer ${token}` } });
      showToast("この資料を学習済みにしました！", 'success');
      setActiveLesson(null);
      setActiveTab('home');
      fetchProgresses(); // 進捗を再取得して最新状態を反映
    } catch(e) {
      showToast("進捗の保存に失敗しました。", 'error');
    }
  };

  // ウィンドウのサイズ変更を検知してサイドバーの開閉を自動制御する
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth <= 768) {
        setIsSidebarOpen(false);
      } else {
        setIsSidebarOpen(true);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    fetchData();
  }, [navigate]);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file && file.size > 3 * 1024 * 1024) {
      showToast("ファイルサイズは3MB以下にしてください。", 'error');
      e.target.value = "";
      setSubmitFile(null);
    } else {
      setSubmitFile(file);
    }
  };

  // --- 各種削除・復元処理 ---
  const handleDelete = (type, id) => {
    setConfirmDialog({
      visible: true,
      message: '削除してゴミ箱に移動しますか？',
      onConfirm: async () => {
        setConfirmDialog({ visible: false, message: '', onConfirm: null });
        const token = localStorage.getItem('token');
        try {
          await axios.delete(`${import.meta.env.VITE_API_URL}/${type}/${id}`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          showToast('削除しました。', 'success');
          fetchData(); // データを再取得
        } catch (e) {
          showToast('削除に失敗しました。', 'error');
        }
      }
    });
  };

  const handleRestore = async (type, id) => {
    const token = localStorage.getItem('token');
    try {
      await axios.post(`${import.meta.env.VITE_API_URL}/trash/restore/${type}/${id}`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      showToast('復元しました。', 'success');
      fetchTrash();
      fetchData();
    } catch (e) {
      showToast('復元に失敗しました。', 'error');
    }
  };

  const handlePermanentDelete = (type, id) => {
    setConfirmDialog({
      visible: true,
      message: '完全に削除しますか？この操作は取り消せません。',
      onConfirm: async () => {
        setConfirmDialog({ visible: false, message: '', onConfirm: null });
        const token = localStorage.getItem('token');
        try {
          await axios.delete(`${import.meta.env.VITE_API_URL}/trash/${type}/${id}`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          showToast('完全に削除しました。', 'success');
          fetchTrash();
        } catch (e) {
          showToast('完全削除に失敗しました。', 'error');
        }
      }
    });
  };

  const handleAssignmentSubmit = async (assignmentId) => {
    if (!assignmentId) {
      showToast("提出する課題を選択してください。", 'error');
      return;
    }
    if (!submitFile) {
      showToast("提出するファイルを選択してください。", 'error');
      return;
    }
    const token = localStorage.getItem('token');
    const formData = new FormData();
    formData.append('file', submitFile);

    try {
      const apiUrl = import.meta.env.VITE_API_URL;
      await axios.post(`${apiUrl}/assignments/${assignmentId}/submit`, formData, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' }
      });
      showToast("課題を提出しました！", 'success');
      setActiveAssignment(null);
      if (activeTab === 'assignments') {
        setActiveTab('home');
      }
      setSubmitFile(null);
      setSelectedSubmitAssignment('');
      fetchProgresses(); // 進捗を再取得して最新状態を反映
    } catch(e) {
      showToast("提出に失敗しました。" + (e.response?.data?.detail || ""), 'error');
    }
  };

  // 文中の **太字** や `コード` をHTMLタグに変換するヘルパー関数
  const parseInlineStyles = (text) => {
    let html = text.replace(/\*\*(.*?)\*\*/g, '<strong class="highlight-text">$1</strong>');
    html = html.replace(/`(.*?)`/g, '<code class="inline-code">$1</code>');
    return html;
  };

  // 教材の中身を解析し、教科書のように美しくレンダリングする関数
  const renderLessonContent = (text) => {
    if (!text) return null;
    const lines = text.split(/\r?\n/);
    const elements = [];
    let inCodeBlock = false;
    let codeBuffer = [];
    
    let inHtmlBlock = false;
    let htmlBuffer = [];
    let htmlDepth = 0;

    // HTMLタグの開きと閉じを数えて、入れ子の深さを判定する関数
    const getHtmlDepthChange = (str) => {
      const openTags = (str.match(/<(?!(br|hr|img|input|meta|link)\b)[a-zA-Z0-9]+(?![^>]*\/>)[^>]*>/gi) || []).length;
      const closeTags = (str.match(/<\/[a-zA-Z0-9]+>/gi) || []).length;
      return openTags - closeTags;
    };

    lines.forEach((line, index) => {
      const trimmedLine = line.trim();

      // コードブロックの開始/終了
      if (trimmedLine.startsWith('```')) {
        if (inHtmlBlock) {
          elements.push(<div key={`html-flush-${index}`} dangerouslySetInnerHTML={{ __html: htmlBuffer.join('\n') }} />);
          inHtmlBlock = false;
          htmlBuffer = [];
          htmlDepth = 0;
        }
        if (inCodeBlock) {
          elements.push(
            <div key={`code-${index}`} className="code-block">
              <pre>
                {codeBuffer.map((cLine, cIndex) => (
                  <span key={cIndex} className="code-line">{cLine}</span>
                ))}
              </pre>
            </div>
          );
          codeBuffer = [];
          inCodeBlock = false;
        } else {
          inCodeBlock = true;
        }
        return;
      }

      // コードブロック内
      if (inCodeBlock) {
        codeBuffer.push(line);
        return;
      }

      // HTMLブロック内（複数行にまたがるHTMLをひとまとめにする）
      if (inHtmlBlock) {
        htmlBuffer.push(parseInlineStyles(line));
        htmlDepth += getHtmlDepthChange(line);
        
        if (htmlDepth <= 0) {
          elements.push(
            <div key={`html-${index}`} dangerouslySetInnerHTML={{ __html: htmlBuffer.join('\n') }} />
          );
          inHtmlBlock = false;
          htmlBuffer = [];
          htmlDepth = 0;
        }
        return;
      }

      // 画像の表示 (Markdown記法 !alt に対応)
      const imgMatch = line.match(/^!\[(.*?)\]\((.*?)\)$/);
      if (imgMatch) {
        elements.push(
          <div key={index} className="lesson-image-container">
            <img src={imgMatch[2]} alt={imgMatch[1]} className="lesson-image" />
            <span className="image-caption">{imgMatch[1]}</span>
          </div>
        );
        return;
      }

      // 大見出し (■ または # 見出しに対応)
      if (trimmedLine.startsWith('■') || trimmedLine.match(/^#\s/)) {
        elements.push(
          <h3 key={index} dangerouslySetInnerHTML={{ __html: `<span class="h-icon">●</span> ${parseInlineStyles(line.replace(/^■\s*|^#\s+/, '').trim())}` }} />
        );
      // 小見出し (・ または ##, ### 見出しに対応)
      } else if (trimmedLine.startsWith('・') || trimmedLine.match(/^#{2,3}\s/)) {
        elements.push(
          <h4 key={index} dangerouslySetInnerHTML={{ __html: parseInlineStyles(line.replace(/^・\s*|^#{2,3}\s+/, '').trim()) }} />
        );
      // リスト項目 (- や * で始まる行に対応)
      } else if (trimmedLine.match(/^[-*]\s/)) {
        elements.push(
          <ul key={index} style={{ margin: '4px 0', paddingLeft: '24px' }}>
            <li dangerouslySetInnerHTML={{ __html: parseInlineStyles(line.replace(/^\s*[-*]\s/, '').trim()) }} />
          </ul>
        );
      // 空行
      } else if (trimmedLine === '') {
        elements.push(<div key={`br-${index}`} style={{ height: '8px' }}></div>);
      // HTMLタグで始まる行
      } else if (trimmedLine.startsWith('<')) {
        const depthChange = getHtmlDepthChange(line);
        if (depthChange <= 0) {
          elements.push(
            <div key={index} dangerouslySetInnerHTML={{ __html: parseInlineStyles(line) }} />
          );
        } else {
          inHtmlBlock = true;
          htmlDepth = depthChange;
          htmlBuffer.push(parseInlineStyles(line));
        }
      // 通常の段落
      } else {
        elements.push(
          <p key={index} dangerouslySetInnerHTML={{ __html: parseInlineStyles(line) }} />
        );
      }
    });
    return elements;
  };

  if (!user) {
    return <div className="loading-screen">読み込み中...</div>;
  }

  return (
    <div className={`app-layout ${isDarkMode ? 'dark-mode' : ''}`}>
      {/* --- カスタム確認ダイアログ --- */}
      {confirmDialog.visible && (
        <div className="confirm-overlay">
          <div className="confirm-dialog">
            <h3 style={{ marginTop: 0, color: '#0f172a' }}>確認</h3>
            <p style={{ color: '#334155', lineHeight: '1.6' }}>{confirmDialog.message}</p>
            <div className="confirm-actions">
              <button 
                onClick={() => setConfirmDialog({ visible: false, message: '', onConfirm: null })} 
                className="confirm-btn cancel"
              >
                キャンセル
              </button>
              <button 
                onClick={confirmDialog.onConfirm} 
                className="confirm-btn proceed"
              >
                削除する
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- Toast 通知 --- */}
      <div className={`toast-container ${toast.type} ${toast.visible ? 'visible' : ''}`}>
        <span className="toast-icon">
          {toast.type === 'success' ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          )}
        </span>
        <span className="toast-message">{toast.message}</span>
      </div>

      {/* A. 左サイドバー */}
      <aside className={`sidebar ${isSidebarOpen ? 'open' : 'closed'}`}>
        <div className="sidebar-header">
          {isSidebarOpen && (
            <div className="sidebar-logo">
              <span className="sidebar-logo-icon">🐍</span> 情報Ⅰ
            </div>
          )}
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="sidebar-toggle-btn" title={isSidebarOpen ? "メニューを折りたたむ" : "メニューを展開する"}>
            {isSidebarOpen ? '◀' : '▶'}
          </button>
        </div>
        
        <nav className="nav-group">
          <div className="nav-title">{isSidebarOpen ? 'メニュー' : '…'}</div>
          <div 
            className={`nav-item ${activeTab === 'home' ? 'active' : ''}`} 
            onClick={() => handleTabChange('home')}
            title="ホーム"
          >
            <span className="nav-icon">🏠</span>
            {isSidebarOpen && <span className="nav-text">ホーム</span>}
          </div>
          <div 
            className={`nav-item ${activeTab === 'lessons' ? 'active' : ''}`} 
            onClick={() => handleTabChange('lessons')}
            title={user.role === 'teacher' ? "授業資料設定" : "授業資料"}
          >
            <span className="nav-icon">📚</span>
            {isSidebarOpen && <span className="nav-text">{user.role === 'teacher' ? "授業資料設定" : "授業資料"}</span>}
          </div>
          <div 
            className={`nav-item ${activeTab === 'assignments' ? 'active' : ''}`} 
            onClick={() => handleTabChange('assignments')}
            title={user.role === 'teacher' ? "課題設定" : "課題"}
          >
            <span className="nav-icon">✍️</span>
            {isSidebarOpen && <span className="nav-text">{user.role === 'teacher' ? "課題設定" : "課題"}</span>}
          </div>
          <div 
            className={`nav-item ${activeTab === 'submit_box' ? 'active' : ''}`} 
            onClick={() => handleTabChange('submit_box')}
            title="提出BOX"
          >
            <span className="nav-icon">📥</span>
            {isSidebarOpen && <span className="nav-text">提出BOX</span>}
          </div>
          <div 
            className={`nav-item ${activeTab === 'progress' ? 'active' : ''}`} 
            onClick={() => { handleTabChange('progress'); fetchProgresses(); }}
            title="学習進捗"
          >
            <span className="nav-icon">📊</span>
            {isSidebarOpen && <span className="nav-text">学習進捗</span>}
          </div>
          {user.role === 'teacher' && (
            <div 
              className={`nav-item ${activeTab === 'trash' ? 'active' : ''}`} 
              onClick={() => { handleTabChange('trash'); fetchTrash(); }}
              title="ゴミ箱"
            >
              <span className="nav-icon">🗑️</span>
              {isSidebarOpen && <span className="nav-text">ゴミ箱</span>}
            </div>
          )}
        </nav>

        <nav className="nav-group">
          <div className="nav-title">{isSidebarOpen ? 'サポート' : '…'}</div>
          <div className="nav-item" title="ヘルプ">
            <span className="nav-icon">❓</span>
            {isSidebarOpen && <span className="nav-text">ヘルプ</span>}
          </div>
        </nav>

        <div className="sidebar-footer">
          <div 
            className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => handleTabChange('settings')}
            title="設定"
          >
            <span className="nav-icon">⚙️</span>
            {isSidebarOpen && <span className="nav-text">設定</span>}
          </div>
        </div>
      </aside>

      {/* モバイル用オーバーレイ（メニューが開いているときの背景の暗い部分） */}
      <div className={`sidebar-overlay ${isSidebarOpen ? 'open' : ''}`} onClick={() => setIsSidebarOpen(false)}></div>

      {/* B & C. メイン領域 */}
      <div className="main-area">
        <header className="top-header">
          <button className="mobile-menu-btn" onClick={() => setIsSidebarOpen(true)} title="メニューを開く">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>
          <div className="user-profile">
            <span className={`role-badge ${user.role === 'teacher' ? 'teacher' : 'student'}`}>{user.role === 'teacher' ? '教員アカウント' : '生徒アカウント'}</span>
            <div className="user-info">
              <span className="user-name">{user.username} さん</span>
              <div className="user-avatar">{user.username.charAt(0).toUpperCase()}</div>
            </div>
            <div className="header-icon">⚙️</div>
            <button onClick={handleLogout} className="logout-btn">ログアウト</button>
          </div>
        </header>

        <main className="content-area">
          <div className="dashboard-container">
            
            {!activeLesson && !activeAssignment && (
              <header className="dashboard-header">
                <div>
                  <p style={{ margin: '0 0 4px 0', color: '#64748b', fontWeight: '600' }}>
                    {activeTab === 'home' ? '学習ダッシュボード' : activeTab === 'lessons' ? '授業資料' : activeTab === 'assignments' ? '課題' : activeTab === 'submit_box' ? '提出BOX' : activeTab === 'progress' ? '学習進捗' : activeTab === 'trash' ? 'ゴミ箱' : '設定'}
                  </p>
                  <h2 className="welcome-text">
                    {activeTab === 'home' ? `ようこそ、${user.username} さん！` : activeTab === 'lessons' ? '学習する章を選びましょう' : activeTab === 'assignments' ? '取り組む課題を選びましょう' : activeTab === 'submit_box' ? '課題の提出と確認' : activeTab === 'progress' ? '現在の進捗状況' : activeTab === 'trash' ? '削除されたアイテム' : 'アプリケーションの設定'}
                  </h2>
                </div>
              </header>
            )}

            {/* 授業資料の詳細画面（美しくレンダリング） */}
            {activeLesson ? (
              <div className="detail-view">
                <button onClick={() => { setActiveLesson(null); setIsEditingLesson(false); }} className="back-btn">
                  <span>←</span> ホームへ戻る
                </button>
                
                {isEditingLesson ? (
                  <div className="content-wrapper">
                    <h3 className="module-title">✏️ 授業資料の編集</h3>
                    <form onSubmit={handleUpdateLesson} className="setting-form">
                      <div className="form-group">
                        <label>タイトル</label>
                        <input type="text" value={editingLessonData.title} onChange={e => setEditingLessonData({...editingLessonData, title: e.target.value})} required />
                      </div>
                      <div className="form-group">
                        <label>内容（Markdown対応）</label>
                        <textarea value={editingLessonData.content} onChange={e => setEditingLessonData({...editingLessonData, content: e.target.value})} required style={{ minHeight: '300px' }}></textarea>
                      </div>
                      <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
                        <button type="submit" className="challenge-btn" style={{ backgroundColor: '#10b981' }}>更新を保存</button>
                        <button type="button" onClick={() => setIsEditingLesson(false)} className="challenge-btn" style={{ backgroundColor: '#64748b' }}>キャンセル</button>
                      </div>
                    </form>
                  </div>
                ) : (
                  <div className="content-wrapper">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #e2e8f0', marginBottom: '50px', paddingBottom: '30px' }}>
                      <h2 className="lesson-title" style={{ borderBottom: 'none', marginBottom: 0, paddingBottom: 0 }}>
                        {activeLesson.title}
                      </h2>
                      {user.role === 'teacher' && (
                        <button 
                          onClick={() => {
                            setEditingLessonData({ title: activeLesson.title, content: activeLesson.content, chapter_id: activeLesson.chapter_id || 1 });
                            setIsEditingLesson(true);
                          }} 
                          className="challenge-btn"
                          style={{ backgroundColor: '#f59e0b', padding: '8px 16px', fontSize: '0.9rem', flexShrink: 0 }}
                        >
                          ✏️ 編集する
                        </button>
                      )}
                    </div>
                    <div className="lesson-body">
                      {renderLessonContent(activeLesson.content)}
                    </div>
                    <div style={{ marginTop: '40px', textAlign: 'center' }}>
                      <button onClick={() => markLessonAsCompleted(activeLesson.id)} className="challenge-btn" style={{ margin: '0 auto' }}>
                        ✅ この資料を学習済みにする
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : activeAssignment ? (
              <div className="detail-view">
                <button onClick={() => setActiveAssignment(null)} className="back-btn">
                  <span>←</span> ホームへ戻る
                </button>
                
                <div className="assignment-wrapper modern-assignment">
                  <header className="modern-assignment-header">
                    <h2 className="modern-assignment-title">{activeAssignment.title}</h2>
                  </header>
                  
                  <div className="modern-assignment-content">
                    <p className="modern-assignment-desc">{activeAssignment.description}</p>
                  </div>

                  {activeAssignment.attachment_filename && (
                    <div className="modern-attachment-section">
                      <h4 className="modern-attachment-title">配布資料 / 添付ファイル</h4>
                      <a 
                        href={`${import.meta.env.VITE_API_URL}/assignments/${activeAssignment.id}/download`} 
                        className="modern-attachment-card"
                      >
                        <div className="attachment-icon">
                          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
                        </div>
                        <div className="attachment-info">
                          <span className="attachment-filename">{activeAssignment.attachment_filename}</span>
                          <span className="attachment-action">クリックしてダウンロード</span>
                        </div>
                      </a>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="dashboard-grid">
                {/* ① 授業資料エリア */}
                {(activeTab === 'home' || activeTab === 'lessons') && (
                  <div className="module-card">
                    <h3 className="module-title">
                      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
                      授業資料を見る
                    </h3>
                    <p className="module-desc">学習したい章を選んで、教科書を読みましょう。</p>
                    {lessons.length === 0 ? <p className="empty-state">現在登録されている資料はありません。</p> : (
                      <div className="item-list">
                        {lessons.map(lesson => (
                          <div key={lesson.id} onClick={() => setActiveLesson(lesson)} className="lesson-item">
                            <strong>{lesson.title}</strong>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                              <span className="action-text">
                                読む
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
                              </span>
                              {user.role === 'teacher' && (
                                <button onClick={(e) => { e.stopPropagation(); handleDelete('lessons', lesson.id); }} className="icon-btn delete-btn" title="ゴミ箱へ移動">🗑️</button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                
                {/* 教員のみ：新規授業資料作成フォーム */}
                {activeTab === 'lessons' && user.role === 'teacher' && (
                  <div className="module-card full-width" style={{ flex: '1 1 100%' }}>
                    <h3 className="module-title">➕ 新規授業資料を作成</h3>
                    <form onSubmit={handleCreateLesson} className="setting-form">
                      <div className="form-group">
                        <label>タイトル</label>
                        <input type="text" value={newLesson.title} onChange={e => setNewLesson({...newLesson, title: e.target.value})} required placeholder="例：第2回：制御構造" />
                      </div>
                      <div className="form-group">
                        <label>内容（Markdown対応）</label>
                        <textarea value={newLesson.content} onChange={e => setNewLesson({...newLesson, content: e.target.value})} required placeholder="本文を入力してください..."></textarea>
                      </div>
                      <button type="submit" className="challenge-btn" style={{ width: 'fit-content' }}>作成して公開</button>
                    </form>
                  </div>
                )}

                {/* ② 課題エリア */}
                {(activeTab === 'home' || activeTab === 'assignments') && (
                  <div className="module-card">
                    <h3 className="module-title">
                      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ec4899" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z"/></svg>
                      課題を行う
                    </h3>
                    <p className="module-desc">授業で学んだ内容を活かして、実際にプログラムを書いてみましょう。</p>
                    {assignments.length === 0 ? <p className="empty-state">現在登録されている課題はありません。</p> : (
                      <div className="item-list">
                        {assignments.map(assignment => (
                          <div key={assignment.id} className="assignment-item">
                            <div className="assignment-info">
                              <strong>{assignment.title}</strong>
                              <span className="status-badge">未着手</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                              <button onClick={() => setActiveAssignment(assignment)} className="challenge-btn">
                                挑戦する
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 7-7 7 7"/><path d="M12 19V5"/></svg>
                              </button>
                              {user.role === 'teacher' && <button onClick={() => handleDelete('assignments', assignment.id)} className="icon-btn delete-btn" title="ゴミ箱へ移動">🗑️</button>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* 教員のみ：新規課題作成フォーム */}
                {activeTab === 'assignments' && user.role === 'teacher' && (
                  <div className="module-card full-width" style={{ flex: '1 1 100%' }}>
                    <h3 className="module-title">➕ 新規課題を作成</h3>
                    <form onSubmit={handleCreateAssignment} className="setting-form">
                      <div className="form-group">
                        <label>課題タイトル</label>
                        <input type="text" value={newAssignment.title} onChange={e => setNewAssignment({...newAssignment, title: e.target.value})} required placeholder="例：第1回課題：四則演算" />
                      </div>
                      <div className="form-group">
                        <label>問題文</label>
                        <textarea value={newAssignment.description} onChange={e => setNewAssignment({...newAssignment, description: e.target.value})} required placeholder="課題の指示や問題文を入力..."></textarea>
                      </div>
                      <div className="form-group">
                        <label>配布ファイル（任意）</label>
                        <input type="file" onChange={e => setNewAssignment({...newAssignment, file: e.target.files[0]})} />
                      </div>
                      <button type="submit" className="challenge-btn" style={{ width: 'fit-content' }}>作成して生徒へ配布</button>
                    </form>
                  </div>
                )}

                {/* 提出BOXエリア */}
                {activeTab === 'submit_box' && (
                  <div className="module-card full-width" style={{ flex: '1 1 100%' }}>
                    <h3 className="module-title">
                      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                      {user.role === 'teacher' ? '提出された課題の一覧' : '課題を提出する'}
                    </h3>
                    
                    {user.role === 'student' && (
                      <div className="setting-form submit-form-card">
                        <div className="form-group">
                          <label>提出する課題</label>
                          <select 
                            className="form-input" 
                            value={selectedSubmitAssignment} 
                            onChange={(e) => setSelectedSubmitAssignment(e.target.value)}
                          >
                            <option value="">-- 課題を選択してください --</option>
                            {assignments.map(a => (
                              <option key={a.id} value={a.id}>{a.title}</option>
                            ))}
                          </select>
                        </div>
                        
                        <div className="form-group" style={{ marginTop: '20px' }}>
                          <label>提出ファイル (最大3MB)</label>
                          <div className="file-upload-area">
                            <input type="file" onChange={handleFileChange} style={{ width: '100%', fontSize: '0.95rem' }} />
                          </div>
                        </div>
                        
                        <div style={{ marginTop: '30px', textAlign: 'center' }}>
                          <button 
                            onClick={() => handleAssignmentSubmit(selectedSubmitAssignment)} 
                            className="modern-submit-btn" 
                            style={{ width: '100%', justifyContent: 'center' }}
                            disabled={!selectedSubmitAssignment || !submitFile}
                          >
                            ファイルをアップロードして提出
                          </button>
                        </div>
                      </div>
                    )}

                    <h4 className="submit-box-subtitle">{user.role === 'teacher' ? '全員の提出ファイル一覧' : 'あなたの提出履歴'}</h4>
                    <div className="student-table-container">
                      <table className="student-table">
                        <thead>
                          <tr>
                            {user.role === 'teacher' && <th style={{ width: '15%', minWidth: '150px' }}>生徒名</th>}
                            <th style={{ width: '30%', minWidth: '350px' }}>課題名</th>
                            <th style={{ width: '15%', minWidth: '150px' }}>ステータス</th>
                            <th style={{ width: '20%', minWidth: '220px' }}>提出日時</th>
                            <th style={{ width: '20%', minWidth: '300px' }}>提出ファイル</th>
                            <th style={{ width: '10%', minWidth: '80px', textAlign: 'center' }}>操作</th>
                          </tr>
                        </thead>
                        <tbody>
                          {progresses.filter(p => p.type === '課題' && p.status === '提出済').length === 0 ? (
                            <tr>
                              <td colSpan={user.role === 'teacher' ? 5 : 4} style={{ textAlign: 'center', color: '#64748b', padding: '20px' }}>提出された課題はありません。</td>
                            </tr>
                          ) : (
                            progresses.filter(p => p.type === '課題' && p.status === '提出済').map(p => (
                              <tr key={p.id}>
                                {user.role === 'teacher' && <td><strong>{p.username}</strong></td>}
                                <td>{p.item_title}</td>
                                <td><span className="status-badge matrix-badge-done">{p.status}</span></td>
                                <td>{new Date(p.updated_at).toLocaleString('ja-JP')}</td>
                                <td>
                                  {p.submitted_file_url ? (
                                    <a href={p.submitted_file_url} target="_blank" rel="noreferrer" style={{ color: '#3b82f6', textDecoration: 'underline', fontWeight: 'bold' }}>{p.submitted_file_name || 'ファイルを見る'}</a>
                                  ) : <span style={{ color: '#94a3b8' }}>ファイルなし</span>}
                                </td>
                                <td style={{ textAlign: 'center' }}>
                                  <button onClick={() => handleDelete('progresses', p.id)} className="icon-btn delete-btn" title="提出を削除">🗑️</button>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* ③ 学習進捗エリア（プレースホルダー） */}
                {activeTab === 'progress' && (
                  <div className="module-card full-width progress-module">
                    <h3 className="module-title">
                      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/></svg>
                      {user.role === 'teacher' ? '生徒の学習進捗・提出状況一覧' : '学習進捗'}
                    </h3>
                    
                    {user.role === 'teacher' ? (
                      students.length === 0 ? (
                        <p className="empty-state">まだ生徒アカウントが登録されていません。</p>
                      ) : (
                        <>
                          <div className="matrix-table-container">
                            <table className="matrix-table">
                            <thead>
                                <tr>
                                  <th className="matrix-th matrix-th-sticky" style={{ minWidth: '120px' }}>生徒名</th>
                                  {lessons.map(l => (
                                    <th key={`l-${l.id}`} className="matrix-th" style={{ color: '#3b82f6', fontWeight: '600', minWidth: '250px' }} title={l.title}>📚 {l.title.length > 25 ? l.title.substring(0, 25) + '…' : l.title}</th>
                                  ))}
                                  {assignments.map(a => (
                                    <th key={`a-${a.id}`} className="matrix-th" style={{ color: '#ec4899', fontWeight: '600', minWidth: '250px' }} title={a.title}>✍️ {a.title.length > 25 ? a.title.substring(0, 25) + '…' : a.title}</th>
                                  ))}
                              </tr>
                            </thead>
                            <tbody>
                              {students.map((student) => (
                                <tr key={student.id}>
                                    <td className="matrix-td matrix-td-sticky">
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        {student.username}
                                        <button onClick={() => handleDelete('users', student.id)} className="icon-btn delete-btn" title="生徒を削除">🗑️</button>
                                      </div>
                                    </td>
                                    {lessons.map(l => {
                                      const prog = progresses.find(p => p.username === student.username && p.item_title === l.title && p.type === '授業資料');
                                      return (
                                        <td key={`l-${l.id}`} className="matrix-td" style={{ textAlign: 'center' }}>
                                          {prog && prog.status === '完了' ? <span className="status-badge matrix-badge-done">完了</span> : <span className="status-badge">未着手</span>}
                                        </td>
                                      );
                                    })}
                                    {assignments.map(a => {
                                      const prog = progresses.find(p => p.username === student.username && p.item_title === a.title && p.type === '課題');
                                      return (
                                        <td key={`a-${a.id}`} className="matrix-td" style={{ textAlign: 'center' }}>
                                          {prog && prog.status === '提出済' ? <span className="status-badge matrix-badge-done">提出済</span> : <span className="status-badge">未着手</span>}
                                        </td>
                                      );
                                    })}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          </div>
                        </>
                      )
                    ) : (
                      <>
                        <p className="module-desc">あなたのこれまでの学習の記録です。</p>
                        {progresses.length === 0 ? (
                          <p className="empty-state">まだ学習記録はありません。</p>
                        ) : (
                          <div className="student-table-container">
                            <table className="student-table">
                              <thead>
                                <tr>
                                  <th style={{ minWidth: '120px' }}>種別</th>
                                  <th style={{ minWidth: '300px' }}>資料・課題名</th>
                                  <th style={{ minWidth: '150px' }}>ステータス</th>
                                </tr>
                              </thead>
                              <tbody>
                                {progresses.map((p) => (
                                  <tr key={p.id}>
                                    <td>
                                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                        {p.type === '授業資料' ? '📚' : '✍️'} {p.type}
                                      </span>
                                    </td>
                                    <td style={{ fontWeight: '500' }}>{p.item_title}</td>
                                    <td>
                                      <span className={`status-badge ${p.status === '完了' || p.status === '提出済' ? 'done' : ''}`}>{p.status}</span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}

                {/* ゴミ箱エリア */}
                {activeTab === 'trash' && user.role === 'teacher' && (
                  <div className="module-card full-width" style={{ flex: '1 1 100%' }}>
                    <h3 className="module-title">🗑️ ゴミ箱（1ヶ月で自動削除）</h3>
                    <p className="module-desc">削除された生徒や資料などはここに一時保存されます。</p>
                    
                    {!trashData ? <p>読み込み中...</p> : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
                        <div>
                          <h4 className="trash-section-title">👤 削除された生徒</h4>
                          {trashData.users.length === 0 ? <p className="trash-empty">なし</p> : (
                            <ul className="trash-list">
                              {trashData.users.map(u => <li key={u.id} className="trash-item">
                                <span>{u.username}</span>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                  <button onClick={() => handleRestore('user', u.id)} className="challenge-btn" style={{ padding: '6px 12px', fontSize: '0.85rem' }}>復元</button>
                                  <button onClick={() => handlePermanentDelete('user', u.id)} className="challenge-btn" style={{ padding: '6px 12px', fontSize: '0.85rem', backgroundColor: '#ef4444' }}>完全に削除</button>
                                </div>
                              </li>)}
                            </ul>
                          )}
                        </div>
                        
                        <div>
                          <h4 className="trash-section-title">📚 削除された授業資料</h4>
                          {trashData.lessons.length === 0 ? <p className="trash-empty">なし</p> : (
                            <ul className="trash-list">
                              {trashData.lessons.map(l => <li key={l.id} className="trash-item">
                                <span>{l.title}</span>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                  <button onClick={() => handleRestore('lesson', l.id)} className="challenge-btn" style={{ padding: '6px 12px', fontSize: '0.85rem' }}>復元</button>
                                  <button onClick={() => handlePermanentDelete('lesson', l.id)} className="challenge-btn" style={{ padding: '6px 12px', fontSize: '0.85rem', backgroundColor: '#ef4444' }}>完全に削除</button>
                                </div>
                              </li>)}
                            </ul>
                          )}
                        </div>

                        <div>
                          <h4 className="trash-section-title">✍️ 削除された課題</h4>
                          {trashData.assignments.length === 0 ? <p className="trash-empty">なし</p> : (
                            <ul className="trash-list">
                              {trashData.assignments.map(a => <li key={a.id} className="trash-item">
                                <span>{a.title}</span>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                  <button onClick={() => handleRestore('assignment', a.id)} className="challenge-btn" style={{ padding: '6px 12px', fontSize: '0.85rem' }}>復元</button>
                                  <button onClick={() => handlePermanentDelete('assignment', a.id)} className="challenge-btn" style={{ padding: '6px 12px', fontSize: '0.85rem', backgroundColor: '#ef4444' }}>完全に削除</button>
                                </div>
                              </li>)}
                            </ul>
                          )}
                        </div>

                        <div>
                          <h4 className="trash-section-title">📥 削除された提出履歴（進捗）</h4>
                          {trashData.progresses.length === 0 ? <p className="trash-empty">なし</p> : (
                            <ul className="trash-list">
                              {trashData.progresses.map(p => <li key={p.id} className="trash-item">
                                <div>
                                  <strong style={{ display: 'block', marginBottom: '4px' }}>{p.username} の {p.type}</strong>
                                  <span className="trash-item-desc">{p.item_title}</span>
                                </div>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                  <button onClick={() => handleRestore('progress', p.id)} className="challenge-btn" style={{ padding: '6px 12px', fontSize: '0.85rem' }}>復元</button>
                                  <button onClick={() => handlePermanentDelete('progress', p.id)} className="challenge-btn" style={{ padding: '6px 12px', fontSize: '0.85rem', backgroundColor: '#ef4444' }}>完全に削除</button>
                                </div>
                              </li>)}
                            </ul>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ④ 設定エリア */}
                {activeTab === 'settings' && (
                  <div className="module-card full-width" style={{ flex: '1 1 100%' }}>
                    <h3 className="module-title">⚙️ 共通設定</h3>
                    <p className="module-desc">アプリケーションの各種設定を変更できます。</p>
                    
                    <div className="setting-item">
                      <div>
                        <strong>ダークモード</strong>
                        <span>画面のテーマを暗くして、目への負担を軽減します。</span>
                      </div>
                      <label className="toggle-switch">
                        <input type="checkbox" checked={isDarkMode} onChange={toggleDarkMode} />
                        <span className="slider"></span>
                      </label>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </main>
        
        <footer className="main-footer">
          <a href="#">Contact</a>
          <a href="#">Privacy</a>
          <a href="#">Terms</a>
          <a href="#">About</a>
        </footer>
      </div>
    </div>
  );
}

export default Dashboard;