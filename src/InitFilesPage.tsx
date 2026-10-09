// Lists the stored init files, each a complete Terria init file JSON built
// from saved catalog groups.

import { useEffect, useState } from "react";
import { initFileDownloadUrl, listInitFiles, type InitFileSummary } from "./api";

export function InitFilesPage() {
  const [files, setFiles] = useState<InitFileSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listInitFiles().then(setFiles, (e: Error) => setError(e.message));
  }, []);

  return (
    <main className="page wide-page">
      <section className="section">
        <div className="preview-head">
          <h2>Init files</h2>
          <a className="btn primary" href="#/init-files/new">
            New init file
          </a>
        </div>
        <p className="hint">
          Each init file is a complete Terria catalog: its top-level groups, the starting map view, base maps and settings. Publish one
          to serve it at /config/&lt;file name&gt;.json, or download it and put it in the map's init folder.
        </p>
        {error && <p className="issues-inline error">{error}</p>}
        {!files && !error && <p className="hint">Loading…</p>}
        {files && (
          <div className="table-wrap">
            <table className="table catalog-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>File</th>
                  <th>Catalog groups</th>
                  <th>Status</th>
                  <th>Test mode</th>
                  <th>Version</th>
                  <th>Updated</th>
                  <th>Updated by</th>
                  <th>
                    <span className="visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {files.map((f) => (
                  <tr key={f.id}>
                    <td>
                      <a className="link" href={`#/init-files/${f.id}`} title="Open in the editor">
                        {f.name}
                      </a>
                      {f.description && <div className="hint row-description">{f.description}</div>}
                    </td>
                    <td>
                      <code>{f.slug}.json</code>
                    </td>
                    <td>{f.catalogCount}</td>
                    <td>
                      {f.published ? (
                        <a className="link" href={f.published.path} target="_blank" rel="noreferrer" title={`Published version ${f.published.version}`}>
                          Published{f.published.version !== f.version && " (out of date)"}
                        </a>
                      ) : (
                        "Not published"
                      )}
                    </td>
                    <td>
                      {f.test ? (
                        <a className="link" href={f.test.path} target="_blank" rel="noreferrer">
                          On
                        </a>
                      ) : (
                        "Off"
                      )}
                    </td>
                    <td>{f.version}</td>
                    <td title={new Date(f.updatedAt).toLocaleString()}>{new Date(f.updatedAt).toLocaleDateString()}</td>
                    <td>{f.updatedBy}</td>
                    <td className="row-actions">
                      <a className="btn small" href={initFileDownloadUrl(f.id)} download>
                        Download
                      </a>
                    </td>
                  </tr>
                ))}
                {files.length === 0 && (
                  <tr>
                    <td colSpan={9} className="hint empty-row">
                      No init files yet. Use New init file to create one.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
