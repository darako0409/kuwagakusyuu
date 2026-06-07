import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import './Login.css';

function Login() {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [isTeacher, setIsTeacher] = useState(false);
  const [teacherCode, setTeacherCode] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');
    
    const apiUrl = import.meta.env.VITE_API_URL;

    try {
      if (isLogin) {
        // ログイン処理（OAuth2仕様に合わせて送信）
        const params = new URLSearchParams();
        params.append('username', username);
        params.append('password', password);
        
        const response = await axios.post(`${apiUrl}/login`, params);
        localStorage.setItem('token', response.data.access_token);
        setMessage('ログイン成功！');
        navigate('/dashboard'); // 成功したらダッシュボードへ
      } else {
        // 新規登録処理
        if (isTeacher && !teacherCode.trim()) {
          setMessage('教員用認証コードを入力してください。');
          return;
        }
        await axios.post(`${apiUrl}/register`, {
          username: username,
          password: password,
          role: isTeacher ? 'teacher' : 'student',
          teacher_code: isTeacher ? teacherCode.trim() : undefined
        });
        setMessage('登録が完了しました。ログインしてください。');
        setIsLogin(true);
        setTeacherCode('');
      }
    } catch (error) {
      if (error.response && error.response.data) {
        setMessage('エラー: ' + (error.response.data.detail || '通信に失敗しました'));
      } else {
        setMessage('エラーが発生しました。サーバーが起動しているか確認してください。');
      }
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-brand">
          <span className="login-brand-icon">🐍</span>
          <span className="login-brand-text">Kuwaga学習サイト</span>
        </div>
        <h2 className="login-title">{isLogin ? 'ログイン' : '新規アカウント作成'}</h2>
        {message && <div className={`message ${message.includes('成功') || message.includes('完了') ? 'success' : 'error'}`}>{message}</div>}
        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label>ユーザーID</label>
          <input 
            type="text" 
            value={username} 
            onChange={(e) => setUsername(e.target.value)} 
            required 
              className="form-input"
              placeholder="学籍番号やIDを入力"
          />
        </div>
          <div className="form-group">
            <label>パスワード</label>
          <input 
            type="password" 
            value={password} 
            onChange={(e) => setPassword(e.target.value)} 
            required 
              className="form-input"
              placeholder="パスワードを入力"
          />
        </div>
        {!isLogin && (
          <>
            <label className="checkbox-group">
              <input type="checkbox" checked={isTeacher} onChange={(e) => { setIsTeacher(e.target.checked); setMessage(''); }} />
              教員アカウントとして登録する
            </label>
            {isTeacher && (
              <div className="form-group teacher-code-group">
                <label>教員用認証コード</label>
                <input 
                  type="password" 
                  value={teacherCode} 
                  onChange={(e) => setTeacherCode(e.target.value)} 
                  className="form-input"
                  placeholder="学校から配布されたコードを入力"
                />
              </div>
            )}
          </>
        )}
          <button type="submit" className="submit-btn">
          {isLogin ? 'ログイン' : '登録'}
        </button>
      </form>
        <div className="toggle-mode-container">
          <button onClick={() => { setIsLogin(!isLogin); setMessage(''); }} className="toggle-mode-btn">
            {isLogin ? 'アカウントをお持ちでない方はこちら' : 'すでにアカウントをお持ちの方はこちら'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default Login;