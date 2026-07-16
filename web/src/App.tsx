import { GithubLogoIcon } from '@phosphor-icons/react/GithubLogo';

const cliCommands = [
  {
    command: 'codiff',
    description: 'Open the current Git repository in Codiff.',
  },
  {
    command: 'codiff -w',
    description: 'Generate a walkthrough and open it in Codiff.',
  },
  {
    command: 'codiff pr 75',
    description: 'Open GitHub pull request 75 using the current repository.',
  },
  {
    command: 'codiff mr 23',
    description: 'Open GitLab merge request 23 using the current repository.',
  },
];

export default function App() {
  return (
    <div className="codiff-web-shell">
      <header className="codiff-web-header">
        <div className="codiff-web-header-inner">
          <a className="codiff-web-brand" href="/">
            <img alt="" className="codiff-web-brand-icon" draggable={false} src="/icon.png" />
            <span>Codiff</span>
          </a>
          <a
            aria-label="Open Codiff on GitHub"
            className="codiff-web-github"
            href="https://github.com/nkzw-tech/codiff"
            rel="noreferrer"
            target="_blank"
            title="Open Codiff on GitHub"
          >
            <GithubLogoIcon aria-hidden size={20} weight="bold" />
          </a>
        </div>
      </header>

      <main className="codiff-web-page codiff-web-guide">
        <div className="codiff-web-guide-hero">
          <section className="codiff-web-guide-intro">
            <img alt="" className="codiff-web-hero-icon" draggable={false} src="/icon.png" />
            <h1>Codiff</h1>
            <p>Effective code reviews</p>
          </section>
          <aside aria-label="Codiff preview" className="codiff-web-guide-preview">
            <picture>
              <source media="(prefers-color-scheme: dark)" srcSet="/codiff-dark.png" />
              <img
                alt="A Codiff walkthrough reviewing code changes"
                draggable={false}
                src="/codiff-light.png"
              />
            </picture>
          </aside>
        </div>

        <section className="codiff-web-guide-section">
          <div className="codiff-web-step">1</div>
          <div className="codiff-web-guide-content">
            <h2>Install Codiff</h2>
            <pre className="codiff-web-command">
              <code>brew install --cask nkzw-tech/tap/codiff</code>
            </pre>
          </div>
        </section>

        <section className="codiff-web-guide-section">
          <div className="codiff-web-step">2</div>
          <div className="codiff-web-guide-content">
            <h2>Install the terminal helper and agent skill</h2>
            <p>
              Open Codiff and choose <code>Codiff &gt; Install Terminal Helper</code> to make the{' '}
              <code>codiff</code> command available in your shell.
            </p>
            <p>
              Then choose <code>Codiff &gt; Install Skill</code> and select Codex, Claude Code, Pi,
              or OpenCode.
            </p>
          </div>
        </section>

        <section className="codiff-web-guide-section">
          <div className="codiff-web-step">3</div>
          <div className="codiff-web-guide-content">
            <h2>Use Codiff from your agent</h2>
            <p>
              Run <code>$codiff</code> to generate a local walkthrough within your agent session and
              open it in Codiff.
            </p>
          </div>
        </section>

        <section className="codiff-web-cli">
          <div className="codiff-web-guide-content">
            <h2>Command line</h2>
            <p>Run these commands from within a Git repository.</p>
            <div className="codiff-web-command-list">
              {cliCommands.map(({ command, description }) => (
                <article className="codiff-web-command-item" key={command}>
                  <code>{command}</code>
                  <p>{description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
