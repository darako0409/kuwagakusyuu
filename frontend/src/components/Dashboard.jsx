import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import PythonRunner from './PythonRunner';

function Dashboard() {
  const [user, setUser] = useState(null);
  const [materials, setMaterials] = useState([]); // 教材を入れる箱を追加
  const [submissions, setSubmissions] = useState([]); // 提出物の一覧を入れる箱
  const navigate = useNavigate();

  useEffect(() => {
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

        // 教材一覧の取得
        const materialsResponse = await axios.get(`${apiUrl}/materials`);
        setMaterials(materialsResponse.data);

        // 教員の場合は生徒の提出物一覧も取得
        if (userResponse.data.role === 'teacher') {
          const submissionsResponse = await axios.get(`${apiUrl}/submissions`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          setSubmissions(submissionsResponse.data);
        }
      } catch (error) {
        console.error('情報の取得に失敗しました', error);
        if (error.response && error.response.status === 401) {
          localStorage.removeItem('token');
          navigate('/');
        }
      }
    };

    fetchData();
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    navigate('/');
  };

  if (!user) {
    return <div style={{ padding: '20px' }}>読み込み中...</div>;
  }

  return (
    <div style={{ padding: '20px' }}>
      <h2>ようこそ、{user.username} さん！</h2>
      <p>権限: {user.role === 'teacher' ? '教員' : '生徒'}</p>
      <button onClick={handleLogout} style={{ padding: '8px 16px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', marginBottom: '20px' }}>
        ログアウト
      </button>

      {user.role === 'teacher' ? (
        <div>
          <h3 style={{ color: '#007bff' }}>📋 生徒の提出状況一覧</h3>
          {submissions.length === 0 ? (
            <p>まだ生徒からの提出物はありません。</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '10px', backgroundColor: 'white' }}>
              <thead>
                <tr style={{ backgroundColor: '#f2f2f2' }}>
                  <th style={{ border: '1px solid #ccc', padding: '10px', width: '15%' }}>生徒名</th>
                  <th style={{ border: '1px solid #ccc', padding: '10px', width: '45%' }}>提出コード</th>
                  <th style={{ border: '1px solid #ccc', padding: '10px', width: '40%' }}>実行結果</th>
                </tr>
              </thead>
              <tbody>
                {submissions.map((sub) => (
                  <tr key={sub.id}>
                    <td style={{ border: '1px solid #ccc', padding: '10px', fontWeight: 'bold' }}>{sub.username}</td>
                    <td style={{ border: '1px solid #ccc', padding: '10px' }}>
                      <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>{sub.code}</pre>
                    </td>
                    <td style={{ border: '1px solid #ccc', padding: '10px' }}>
                      <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'monospace', color: sub.output.includes('Error') ? 'red' : 'inherit' }}>{sub.output}</pre>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        <>
          <h3>教材一覧</h3>
          {materials.length === 0 ? (
            <p>現在登録されている教材はありません。</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              {materials.map((material) => (
                <div key={material.id} style={{ border: '1px solid #ccc', padding: '15px', borderRadius: '8px' }}>
                  <h4 style={{ margin: '0 0 10px 0' }}>{material.title} <span style={{ fontSize: '0.8em', color: '#666', fontWeight: 'normal' }}>({material.type === 'assignment' ? '課題' : 'テキスト'})</span></h4>
                  <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{material.content}</p>
                </div>
              ))}
            </div>
          )}
          <PythonRunner />
        </>
      )}
    </div>
  );
}

export default Dashboard;