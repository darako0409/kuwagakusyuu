import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

function Login() {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [isTeacher, setIsTeacher] = useState(false);
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
        await axios.post(`${apiUrl}/register`, {
          username: username,
          password: password,
          role: isTeacher ? 'teacher' : 'student'
        });
        setMessage('登録が完了しました。ログインしてください。');
        setIsLogin(true);
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
    <div style={{ maxWidth: '400px', margin: '50px auto', padding: '20px', border: '1px solid #ccc', borderRadius: '8px' }}>
      <h2>{isLogin ? 'ログイン' : '新規登録'}</h2>
      {message && <p style={{ color: 'red' }}>{message}</p>}
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
        <div>
          <label>ユーザー名:</label><br />
          <input 
            type="text" 
            value={username} 
            onChange={(e) => setUsername(e.target.value)} 
            required 
            style={{ width: '100%', padding: '8px' }}
          />
        </div>
        <div>
          <label>パスワード:</label><br />
          <input 
            type="password" 
            value={password} 
            onChange={(e) => setPassword(e.target.value)} 
            required 
            style={{ width: '100%', padding: '8px' }}
          />
        </div>
        {!isLogin && (
          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input type="checkbox" checked={isTeacher} onChange={(e) => setIsTeacher(e.target.checked)} />
              教員アカウントとして登録する
            </label>
          </div>
        )}
        <button type="submit" style={{ padding: '10px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
          {isLogin ? 'ログイン' : '登録'}
        </button>
      </form>
      <p style={{ marginTop: '20px', textAlign: 'center' }}>
        <button 
          onClick={() => { setIsLogin(!isLogin); setMessage(''); }} 
          style={{ background: 'none', border: 'none', color: '#007bff', textDecoration: 'underline', cursor: 'pointer' }}
        >
          {isLogin ? '新規登録はこちら' : 'ログイン画面に戻る'}
        </button>
      </p>
    </div>
  );
}

export default Login;