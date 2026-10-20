// Lists the stored init files, each a complete Terria init file JSON built
// from saved catalog groups. Any of them can be downloaded or copied from here,
// and deleted unless published.

import { useEffect, useState } from "react";
import { copyInitFile, deleteInitFile, initFileDownloadUrl, listInitFiles, type InitFileSummary } from "./api";
import { confirmDialog } from "./dialogs";
import { Icon } from "./Icon";

export function InitFilesPage() {
  const [files, setFiles] = useState<InitFileSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    listInitFiles().then(setFiles, (e: Error) => setError(e.message));
  }, []);

  // Opens the copy, so it can be renamed straight away.
  const copy = async (file: InitFileSummary) => {
    setError(null);
    setMessage(null);
    try {
      const created = await copyInitFile(file.id);
      location.assign(`#/init-files/${created.id}`);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const remove = async (file: InitFileSummary) => {
    const removed = file.test ? ` Its test copy (${file.test.path}) is removed;` : "";
    const ok = await confirmDialog({
      title: "Delete this init file?",
      message: `Delete the init file “${file.name}” (${file.slug}.json)?${removed} its catalog groups and items are kept.`,
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    setError(null);
    setMessage(null);
    try {
      await deleteInitFile(file.id);
      setFiles((prev) => prev?.filter((f) => f.id !== file.id) ?? null);
      setMessage(`Deleted “${file.name}”`);
    } catch (e) {
      setError((e as Error).message);
    }
  };

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
        {message && <p className="save-message ok">{message}</p>}
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
                      <a
                        className="icon-btn"
                        href={initFileDownloadUrl(f.id)}
                        download
                        title="Download the init file JSON"
                        aria-label={`Download ${f.name}`}
                      >
                        <Icon name="download" />
                      </a>
                      <button
                        type="button"
                        className="icon-btn"
                        title="Copy: make an unpublished copy and open it"
                        aria-label={`Copy ${f.name}`}
                        onClick={() => copy(f)}
                      >
                        <Icon name="copy" />
                      </button>
                      <button
                        type="button"
                        className="icon-btn"
                        disabled={f.published !== null}
                        title={f.published ? "Published init files can't be deleted; unpublish it first" : "Delete this init file"}
                        aria-label={`Delete ${f.name}`}
                        onClick={() => remove(f)}
                      >
                        <Icon name="trash" />
                      </button>
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
