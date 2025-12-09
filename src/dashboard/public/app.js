/** @format */

document.addEventListener('DOMContentLoaded', function () {
	const app = {
		currentWorkspace: null,
		currentSection: 'overview',
		currentFile: null,

		init() {
			this.setupTabs();
			this.loadWorkspaces();
			this.bindEvents();
		},

		setupTabs() {
			const navItems = document.querySelectorAll('.nav-item');
			navItems.forEach((item) => {
				item.addEventListener('click', () => {
					const section = item.dataset.section;
					this.switchSection(section);
				});
			});
		},

		switchSection(section) {
			// Update sidebar nav active state
			document.querySelectorAll('.nav-item').forEach((item) => {
				item.classList.toggle('active', item.dataset.section === section);
			});

			// Update section visibility
			document.querySelectorAll('.content-section').forEach((sec) => {
				sec.classList.toggle('active', sec.id === section);
			});

			this.currentSection = section;

			// Update breadcrumb
			this.updateBreadcrumb(section);

			// Load content if needed
			if (section === 'overview' && this.currentWorkspace) {
				this.loadOverview();
			} else if (section === 'jobs' && this.currentWorkspace) {
				this.loadJobs();
			} else if (section === 'structure' && this.currentWorkspace) {
				this.loadStructure();
			} else if (section === 'setup') {
				this.loadSetup();
			}
		},

		updateBreadcrumb(section) {
			const sectionName = {
				overview: 'Overview',
				jobs: 'Jobs',
				structure: 'Files',
				preview: this.currentFile ? this.currentFile.split('/').pop() : 'Preview'
			}[section] || section;

			document.getElementById('current-section').textContent = sectionName;
		},

		async loadWorkspaces() {
			try {
				const response = await fetch('/api/workspaces');
				const workspaces = await response.json();
				this.renderWorkspaceSelector(workspaces);
				if (workspaces.length > 0) {
					this.selectWorkspace(workspaces[0]);
				}
			} catch (error) {
				console.error('Failed to load workspaces:', error);
			}
		},

		renderWorkspaceSelector(workspaces) {
			const selector = document.querySelector('.workspace-selector');
			const select = document.createElement('select');
			select.id = 'workspace-select';
			select.innerHTML = workspaces
				.map((ws) => `<option value="${ws}">${ws}</option>`)
				.join('');
			selector.innerHTML = 'Select Workspace: ';
			selector.appendChild(select);

			select.addEventListener('change', (e) => {
				this.selectWorkspace(e.target.value);
			});
		},

		selectWorkspace(workspace) {
			this.currentWorkspace = workspace;
			document.getElementById(
				'workspace-title'
			).textContent = `Workspace: ${workspace}`;
			this.loadOverview();
		},

		updateArchitectureMode(mode) {
			// Update UI to show architecture mode if available
			const modeIndicator = document.getElementById('architecture-mode');
			if (modeIndicator) {
				let modeText = 'Unknown Architecture';
				let modeClass = 'unknown';

				if (mode === 'single-project') {
					modeText = '📦 Single-Project Mode';
					modeClass = 'single';
				} else if (mode === 'multi-project') {
					modeText = '🏢 Multi-Project Mode';
					modeClass = 'multi';
				} else if (mode === 'mixed') {
					modeText = '🔄 Mixed Mode';
					modeClass = 'mixed';
				}

				modeIndicator.textContent = modeText;
				modeIndicator.className = `architecture-mode ${modeClass}`;
			}
		},

		async loadOverview() {
			if (!this.currentWorkspace) return;

			try {
				// Load jobs stats and architecture mode
				const jobsResponse = await fetch(`/api/jobs/${this.currentWorkspace}`);
				const { jobs, project_mode } = await jobsResponse.json();

				// Update architecture mode display
				this.updateArchitectureMode(project_mode);

				const totalJobs = jobs.length;
				const activeJobs = jobs.filter((job) => job.location === 'to-do').length;
				const completedJobs = jobs.filter(
					(job) => job.location === 'done-to-do'
				).length;
				const totalTasks = jobs.reduce((sum, job) => sum + job.tasks.length, 0);
				const completedTasks = jobs.reduce(
					(sum, job) =>
						sum + job.tasks.filter((task) => task.status === 'completed').length,
					0
				);

				const completionRate = totalTasks > 0
					? Math.round((completedTasks / totalTasks) * 100)
					: 0;

				// Show loading state
				document.getElementById('overview-stats').innerHTML = `
                    <div class="stats-grid">
                        <div class="stat-card skeleton"><div class="stat-title skeleton-text"></div><div class="skeleton-text"></div><div class="skeleton-text"></div></div>
                        <div class="stat-card skeleton"><div class="stat-title skeleton-text"></div><div class="skeleton-text"></div><div class="skeleton-text"></div></div>
                        <div class="stat-card skeleton"><div class="stat-title skeleton-text"></div><div class="skeleton-text"></div><div class="skeleton-text"></div></div>
                        <div class="stat-card skeleton"><div class="stat-title skeleton-text"></div><div class="skeleton-text"></div><div class="skeleton-text"></div></div>
                        <div class="stat-card skeleton"><div class="stat-title skeleton-text"></div><div class="skeleton-text"></div><div class="skeleton-text"></div></div>
                        <div class="stat-card skeleton"><div class="stat-title skeleton-text"></div><div class="skeleton-text"></div><div class="skeleton-text"></div></div>
                        <div class="stat-card skeleton"><div class="stat-title skeleton-text"></div><div class="skeleton-text"></div><div class="skeleton-text"></div></div>
                    </div>
                    <div class="card">
                        <h3>Recent Jobs</h3>
                        <div class="skeleton" style="height: 200px;"></div>
                    </div>
                `;

				let modeDescription = '';
				if (project_mode === 'single-project') {
					modeDescription = 'Single-project workspace with direct task organization';
				} else if (project_mode === 'multi-project') {
					modeDescription = 'Multi-project workspace with component isolation';
				} else if (project_mode === 'mixed') {
					modeDescription = 'Mixed-mode workspace with both single and multi-project patterns';
				} else {
					modeDescription = 'Architecture mode not detected - may need initialization';
				}

				// Update with real data
				document.getElementById('overview-stats').innerHTML = `
                    <div class="stats-grid">
                        <div class="stat-card">
                            <div class="stat-title">Architecture</div>
                            <div id="architecture-mode">${modeDescription}</div>
                            <div class="stat-label">${modeDescription}</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-number">${totalJobs}</div>
                            <div class="stat-label">Total Jobs</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-number">${activeJobs}</div>
                            <div class="stat-label">Active Jobs</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-number">${completedJobs}</div>
                            <div class="stat-label">Completed Jobs</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-number">${totalTasks}</div>
                            <div class="stat-label">Total Tasks</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-number">${completedTasks}</div>
                            <div class="stat-label">Completed Tasks</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-number">${completionRate}%</div>
                            <div class="stat-label">Completion Rate</div>
                        </div>
                    </div>

                    <div class="card">
                        <h3>Recent Jobs</h3>
                        <div id="recent-jobs">
                            ${jobs
						.slice(0, 5)
						.map(
							(job) => `
                                <div class="job-item" onclick="app.showJobDetails(${job.id
								})">
                                    <strong>#${job.id} - ${job.title}</strong>
                                    <div class="flex-between">
                                        <span class="status-indicator status-${job.location === 'to-do'
									? 'active'
									: 'completed'
								}">
                                            ${job.location === 'to-do'
									? 'Active'
									: 'Completed'
								}
                                        </span>
                                        <span>${job.tasks.length} tasks</span>
                                    </div>
                                </div>
                            `
						)
						.join('')}
                        </div>
                    </div>
                `;
			} catch (error) {
				console.error('Failed to load overview:', error);
				document.getElementById('overview-stats').innerHTML = '<p>Failed to load overview data.</p>';
			}
		},

		async loadJobs() {
			if (!this.currentWorkspace) return;

			const jobsContainer = document.getElementById('jobs-container');

			try {
				// Show loading state
				jobsContainer.innerHTML = `
				<div class="skeleton skeleton-card"></div>
				<div class="skeleton skeleton-card"></div>
				<div class="skeleton skeleton-card"></div>
			`;

				const response = await fetch(`/api/jobs/${this.currentWorkspace}`);
				const jobs = await response.json();

				jobsContainer.innerHTML = '';

				if (jobs.length === 0) {
					jobsContainer.innerHTML = '<p>No jobs found in this workspace.</p>';
					return;
				}

				jobs.forEach((job) => {
					const jobElement = document.createElement('div');
					jobElement.className = 'job-item';
					jobElement.onclick = () => this.showJobDetails(job.id);

					const status = job.location === 'to-do' ? 'Active' : 'Completed';
					const statusClass = job.location === 'to-do' ? 'active' : 'completed';

					jobElement.innerHTML = `
                        <div class="flex-between">
                            <h3>#${job.id} - ${job.title}</h3>
                            <div class="status-indicator status-${statusClass}">${status}</div>
                        </div>
                        <p>${job.description}</p>
                        <div class="flex">
                            <span class="tag">${job.domain || 'general'}</span>
                            <span>${job.tasks.length} tasks</span>
                        </div>
                    `;

					jobsContainer.appendChild(jobElement);
				});
			} catch (error) {
				console.error('Failed to load jobs:', error);
				jobsContainer.innerHTML = '<p>Failed to load jobs.</p>';
			}
		},

		async showJobDetails(jobId) {
			try {
				const response = await fetch(
					`/api/job/${this.currentWorkspace}/${jobId}`
				);
				const job = await response.json();

				const modal = document.createElement('div');
				modal.className = 'modal';
				modal.innerHTML = `
                    <div class="modal-content card">
                        <div class="flex-between">
                            <h2>#${job.id} - ${job.title}</h2>
                            <button onclick="this.closest('.modal').remove()">×</button>
                        </div>
                        <p><strong>Description:</strong> ${job.description}</p>
                        <p><strong>Domain:</strong> ${job.domain}</p>
                        <p><strong>Location:</strong> ${job.location}</p>

                        <h3>Tasks</h3>
                        <div class="task-list">
                            ${job.tasks
						.map(
							(task) => `
                                <div class="task-item ${task.status === 'completed' ? 'completed' : ''
								}">
                                    <div class="flex-between">
                                        <h4>${task.title}</h4>
                                        <span class="status-${task.status
								} priority-${task.priority}">${task.status
								}</span>
                                    </div>
                                    <p>${task.description}</p>
                                    <div class="flex">
                                        <span>Priority: ${task.priority}</span>
                                        <span>Complexity: ${task.complexity
								}</span>
                                        <span>Team: ${task.team}</span>
                                    </div>
                                </div>
                            `
						)
						.join('')}
                        </div>
                    </div>
                `;

				document.body.appendChild(modal);
			} catch (error) {
				console.error('Failed to load job details:', error);
			}
		},

		async loadStructure() {
			if (!this.currentWorkspace) return;

			const container = document.getElementById('structure-tree');
			container.innerHTML = `<div class="skeleton" style="height: 300px;"></div>`;

			try {
				const response = await fetch(
					`/api/project-structure/${this.currentWorkspace}`
				);
				const data = await response.json();
				this.renderTree(
					data.structure,
					container
				);
			} catch (error) {
				console.error('Failed to load structure:', error);
				container.innerHTML = '<p>Failed to load project structure.</p>';
			}
		},

		renderTree(nodes, container) {
			container.innerHTML = '';

			const renderNode = (node) => {
				const element = document.createElement('div');
				element.className = `tree-node ${node.type}`;

				if (node.type === 'file') {
					element.onclick = () => this.showFilePreview(node.path);
					const fileIcon = node.ext === 'md' ? getIcon('fileText', 16) : getIcon('file', 16);
					element.innerHTML = `${fileIcon} <span>${node.name}</span>`;
				} else {
					const folderIcon = getIcon('folder', 16);
					element.innerHTML = `
                        ${folderIcon} <span>${node.name}</span>
                        <div class="tree-children" style="display: none;"></div>
                    `;
					element.onclick = (e) => {
						e.stopPropagation();
						const children = element.querySelector('.tree-children');
						children.style.display =
							children.style.display === 'none' ? 'block' : 'none';
					};

					if (node.children) {
						const childrenContainer = element.querySelector('.tree-children');
						node.children.forEach((child) => {
							childrenContainer.appendChild(renderNode(child));
						});
					}
				}

				return element;
			};

			nodes.forEach((node) => {
				container.appendChild(renderNode(node));
			});
		},

		async showFilePreview(path) {
			try {
				// Switch to preview section first, show loading
				this.switchSection('preview');
				document.getElementById('preview-title').textContent = path.split('/').pop();
				document.getElementById('preview-path').textContent = path;
				this.currentFile = path;

				const preview = document.getElementById('file-preview');
				preview.innerHTML = `<div class="skeleton" style="height: 400px;"></div>`;
				preview.className = 'markdown-preview';

				const response = await fetch(
					`/api/file?path=${this.currentWorkspace}/${path}`
				);
				const data = await response.json();

				// Update with content
				preview.innerHTML = data.html ? data.html : `<pre>${data.raw}</pre>`;
			} catch (error) {
				console.error('Failed to preview file:', error);
				document.getElementById('file-preview').innerHTML = '<p>Failed to load file preview.</p>';
			}
		},

		async loadSetup() {
			try {
				const response = await fetch('/api/config-preview');
				const config = await response.json();
				document.getElementById('config-preview').textContent = JSON.stringify(config, null, 2);
			} catch (error) {
				console.error('Failed to load config preview:', error);
			}
		},

		async installMcpServer() {
			const statusDiv = document.getElementById('install-status');
			const btn = document.getElementById('btn-install-mcp');

			try {
				btn.disabled = true;
				btn.textContent = 'Installing...';
				statusDiv.className = 'status-message';
				statusDiv.textContent = 'Copying files and updating config...';

				const response = await fetch('/api/setup', { method: 'POST' });
				const result = await response.json();

				if (response.ok) {
					statusDiv.className = 'status-message success';
					statusDiv.textContent = '✅ Successfully installed! Please restart Claude Desktop.';
				} else {
					throw new Error(result.error || 'Installation failed');
				}
			} catch (error) {
				statusDiv.className = 'status-message error';
				statusDiv.textContent = `❌ Error: ${error.message}`;
			} finally {
				btn.disabled = false;
				btn.textContent = 'Install to Claude';
			}
		},

		async uninstallMcpServer() {
			if (!confirm('Are you sure you want to uninstall CONDUCKS from Claude? This will remove the ~/.conducks folder.')) {
				return;
			}

			const statusDiv = document.getElementById('install-status');
			const btn = document.getElementById('btn-uninstall-mcp');

			try {
				btn.disabled = true;
				btn.textContent = 'Uninstalling...';
				statusDiv.className = 'status-message';
				statusDiv.textContent = 'Removing files and cleaning config...';

				const response = await fetch('/api/uninstall', { method: 'POST' });
				const result = await response.json();

				if (response.ok) {
					statusDiv.className = 'status-message success';
					statusDiv.textContent = '✅ Successfully uninstalled from Claude.';
				} else {
					throw new Error(result.error || 'Uninstall failed');
				}
			} catch (error) {
				statusDiv.className = 'status-message error';
				statusDiv.textContent = `❌ Error: ${error.message}`;
			} finally {
				btn.disabled = false;
				btn.textContent = 'Uninstall';
			}
		},

		bindEvents() {
			// Additional event bindings can go here
		},
	};

	// Initialize the app
	app.init();
});
