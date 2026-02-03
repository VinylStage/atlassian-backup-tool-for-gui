/**
 * @file 페이지 뷰어 컴포넌트
 * @description 선택된 Confluence 페이지의 내용을 미리보기하고 다운로드하는 컴포넌트
 *
 * 주요 기능:
 * - 페이지 메타데이터 표시
 * - HTML 미리보기 / Markdown 보기 전환
 * - 개별 페이지 다운로드 (HTML/MD/PDF)
 *
 * 뷰 모드:
 * - Preview: HTML로 렌더링된 미리보기
 * - Markdown: 변환된 마크다운 소스 텍스트
 */

import { useState, useEffect } from 'react';
import { Page, api } from '../services/api';
import { useStore } from '../store/useStore';

// ===== 타입 정의 =====

/**
 * PageViewer 컴포넌트의 Props
 */
interface Props {
  page: Page; // 표시할 페이지 데이터
}

/**
 * 페이지 뷰어 컴포넌트
 *
 * @description
 * 선택된 페이지의 내용을 보여주고 다운로드 기능 제공
 *
 * 상태:
 * - viewMode: 'preview' | 'markdown' 보기 모드
 * - preview: API에서 받은 HTML/Markdown 데이터
 * - formats: 다운로드할 포맷 선택
 *
 * @param {Props} props - 컴포넌트 속성
 */
export default function PageViewer({ page }: Props) {
  // ===== 상태 관리 =====

  /** 현재 보기 모드 ('preview' = HTML, 'markdown' = 소스) */
  const [viewMode, setViewMode] = useState<'preview' | 'markdown'>('preview');

  /** API에서 받은 미리보기 데이터 */
  const [preview, setPreview] = useState<{ html: string; markdown: string } | null>(null);

  /** 미리보기 로딩 상태 */
  const [loading, setLoading] = useState(false);

  // 다운로드 관련 상태
  /** 다운로드할 포맷 선택 (기본: HTML + MD) */
  const [formats, setFormats] = useState({ html: true, md: true, pdf: false });
  /** 다운로드 진행 중 여부 */
  const [downloading, setDownloading] = useState(false);
  /** 다운로드 에러 메시지 */
  const [downloadError, setDownloadError] = useState<string | null>(null);

  // Zustand에서 현재 Space 이름 가져오기 (파일명에 사용)
  const selectedSpace = useStore((state) => state.selectedSpace);

  // ===== 페이지 변경 시 미리보기 로드 =====

  /**
   * 페이지가 변경될 때마다 미리보기 데이터 로드
   *
   * @description
   * useEffect 의존성에 page.id 포함
   * 다른 페이지 선택 시 자동으로 새 미리보기 로드
   */
  useEffect(() => {
    loadPreview();
  }, [page.id]);

  /**
   * 미리보기 데이터 로드 함수
   *
   * @description
   * API 호출하여 HTML과 Markdown 변환 결과 가져오기
   * 실패 시 preview를 null로 설정
   */
  async function loadPreview() {
    try {
      setLoading(true);
      // API 호출: 서버에서 HTML/Markdown 변환
      const data = await api.getPagePreview(page.id);
      setPreview(data);
    } catch (err) {
      console.error('Failed to load preview:', err);
      setPreview(null);
    } finally {
      setLoading(false);
    }
  }

  /**
   * 다운로드 핸들러
   *
   * @description
   * 선택된 포맷으로 페이지 다운로드 요청
   * 최소 하나의 포맷이 선택되어야 함
   */
  async function handleDownload() {
    // 포맷 미선택 검사
    if (!formats.html && !formats.md && !formats.pdf) {
      setDownloadError('Select at least one format');
      return;
    }

    try {
      setDownloading(true);
      setDownloadError(null);
      // API 호출: ZIP 다운로드
      await api.downloadPage(page.id, selectedSpace?.name || '', formats);
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setDownloading(false);
    }
  }

  // ===== 렌더링 =====

  return (
    <div style={{ marginTop: '1rem' }}>
      {/* ===== 페이지 메타데이터 ===== */}
      <div className="page-meta">
        <div className="page-meta-item">
          <span className="page-meta-label">ID:</span>
          <span>{page.id}</span>
        </div>
        <div className="page-meta-item">
          <span className="page-meta-label">Space:</span>
          <span>{page.spaceId}</span>
        </div>
        <div className="page-meta-item">
          <span className="page-meta-label">Parent:</span>
          <span>{page.parentId || 'Root'}</span>
        </div>
        <div className="page-meta-item">
          <span className="page-meta-label">Status:</span>
          <span>{page.status}</span>
        </div>
      </div>

      {/* ===== 콘텐츠 카드 ===== */}
      <div className="card">
        {/* 뷰 모드 전환 버튼 */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <button
            className={`btn ${viewMode === 'preview' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setViewMode('preview')}
          >
            Preview
          </button>
          <button
            className={`btn ${viewMode === 'markdown' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setViewMode('markdown')}
          >
            Markdown
          </button>
        </div>

        {/* ===== 다운로드 컨트롤 ===== */}
        <div className="download-controls">
          {/* HTML 포맷 체크박스 */}
          <label className="format-checkbox">
            <input
              type="checkbox"
              checked={formats.html}
              onChange={(e) => setFormats({ ...formats, html: e.target.checked })}
            />
            <span className="format-label">HTML</span>
          </label>

          {/* Markdown 포맷 체크박스 */}
          <label className="format-checkbox">
            <input
              type="checkbox"
              checked={formats.md}
              onChange={(e) => setFormats({ ...formats, md: e.target.checked })}
            />
            <span className="format-label">MD</span>
          </label>

          {/* PDF 포맷 체크박스 */}
          <label className="format-checkbox">
            <input
              type="checkbox"
              checked={formats.pdf}
              onChange={(e) => setFormats({ ...formats, pdf: e.target.checked })}
            />
            <span className="format-label">PDF</span>
          </label>

          {/* 다운로드 버튼 */}
          <button
            className="btn btn-primary btn-sm"
            onClick={handleDownload}
            disabled={downloading || (!formats.html && !formats.md && !formats.pdf)}
          >
            {downloading ? 'Downloading...' : 'Download'}
          </button>
        </div>

        {/* 다운로드 에러 메시지 */}
        {downloadError && (
          <div className="error-message" style={{ marginBottom: '0.5rem', fontSize: '0.75rem' }}>
            {downloadError}
          </div>
        )}

        {/* ===== 페이지 제목 ===== */}
        <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem', fontWeight: 600 }}>
          {page.title}
        </h2>

        {/* ===== 콘텐츠 본문 ===== */}
        {loading ? (
          // 로딩 상태
          <div className="loading">Loading preview...</div>
        ) : viewMode === 'preview' && preview ? (
          // Preview 모드: HTML 렌더링
          // dangerouslySetInnerHTML: React에서 HTML 직접 삽입
          // XSS 위험이 있으므로 신뢰할 수 있는 소스에서만 사용
          <div
            className="prose"
            dangerouslySetInnerHTML={{ __html: preview.html }}
            style={{
              padding: '1rem',
              backgroundColor: 'var(--color-bg-secondary)',
              borderRadius: '8px',
              border: '1px solid var(--color-border)',
            }}
          />
        ) : (
          // Markdown 모드: 소스 텍스트 표시
          <pre className="raw-view">
            {preview?.markdown || 'No content'}
          </pre>
        )}
      </div>
    </div>
  );
}
