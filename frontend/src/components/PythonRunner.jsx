import React, { useState, useEffect } from 'react';
import axios from 'axios';

function PythonRunner() {
  const [pyodide, setPyodide] = useState(null);
  const [code, setCode] = useState('print("Hello, Python!")\n\nfor i in range(3):\n    print(f"カウント: {i}")');
  const [output, setOutput] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [submitMessage, setSubmitMessage] = useState('');

  useEffect(() => {
    const loadPyodideEnvironment = async () => {
      try {
        // Pyodideのスクリプトを読み込む
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/pyodide/v0.25.0/full/pyodide.js';
        script.async = true;
        document.body.appendChild(script);

        script.onload = async () => {
          // Pyodideの初期化
          const pyodideInstance = await window.loadPyodide({
            indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.25.0/full/',
          });
          
          // print文の出力（標準出力）を画面のoutputに流し込む設定
          pyodideInstance.setStdout({ batched: (text) => {
            setOutput((prev) => prev + text + '\n');
          }});

          setPyodide(pyodideInstance);
          setIsLoading(false);
        };
      } catch (error) {
        console.error('Pyodideの読み込みに失敗しました', error);
        setOutput('Python環境の初期化に失敗しました。');
        setIsLoading(false);
      }
    };

    loadPyodideEnvironment();
  }, []);

  const runCode = async () => {
    if (!pyodide) return;
    setOutput(''); // 実行のたびに出力をリセット
    try {
      await pyodide.runPythonAsync(code);
    } catch (error) {
      setOutput((prev) => prev + error.toString() + '\n'); // エラーも画面に表示
    }
  };

  const submitCode = async () => {
    setSubmitMessage('');
    const token = localStorage.getItem('token');
    if (!token) {
      setSubmitMessage('エラー：ログインしていません。');
      return;
    }
    try {
      const apiUrl = import.meta.env.VITE_API_URL;
      await axios.post(`${apiUrl}/submissions`, {
        code: code,
        output: output
      }, { headers: { Authorization: `Bearer ${token}` } });
      setSubmitMessage('✅ 課題を提出しました！');
    } catch (error) {
      setSubmitMessage('❌ 提出に失敗しました。');
    }
  };

  return (
    <div style={{ marginTop: '40px', border: '2px solid #007bff', borderRadius: '8px', padding: '20px', backgroundColor: '#f8f9fa' }}>
      <h3 style={{ marginTop: 0, color: '#007bff' }}>🐍 Python 実行環境</h3>
      {isLoading ? (
        <p>Python環境を準備中です...（初回は数秒〜十数秒かかります）</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <div>
            <label style={{ fontWeight: 'bold' }}>コードエディタ:</label>
            <textarea
              value={code}
              onChange={(e) => setCode(e.target.value)}
              style={{ width: '100%', height: '150px', fontFamily: 'monospace', padding: '10px', fontSize: '16px', borderRadius: '4px', border: '1px solid #ccc' }}
            />
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <button 
              onClick={runCode} 
              style={{ padding: '10px 20px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
            >
              ▶ 実行する
            </button>
            <button onClick={submitCode} style={{ padding: '10px 20px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
              📤 教員に提出する
            </button>
            {submitMessage && <span style={{ fontWeight: 'bold', color: submitMessage.includes('✅') ? 'green' : 'red' }}>{submitMessage}</span>}
          </div>
          <div>
            <label style={{ fontWeight: 'bold' }}>実行結果 (コンソール):</label>
            <pre style={{ backgroundColor: '#212529', color: '#f8f9fa', padding: '15px', borderRadius: '4px', minHeight: '60px', whiteSpace: 'pre-wrap', fontFamily: 'monospace', margin: 0 }}>
              {output}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

export default PythonRunner;