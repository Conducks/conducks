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

		async loadOverview() {
			if (!this.currentWorkspace) return;

			// Load jobs stats
			const jobsResponse = await fetch(`/api/jobs/${this.currentWorkspace}`);
			const jobs = await jobsResponse.json();

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

			document.getElementById('overview-stats').innerHTML = `
                <div class="stats-grid">
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
                        <div class="stat-number">${totalTasks > 0
					? Math.round((completedTasks / totalTasks) * 100)
					: 0
				}%</div>
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
                                    <span class="status-${job.location === 'to-do'
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
		},

		async loadJobs() {
			if (!this.currentWorkspace) return;

			const response = await fetch(`/api/jobs/${this.currentWorkspace}`);
			const jobs = await response.json();

			const jobsContainer = document.getElementById('jobs-container');
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
                        <div class="status-indicator status-${statusClass.toLowerCase()}">${status}</div>
                    </div>
                    <p>${job.description}</p>
                    <div class="flex">
                        <span class="tag">${job.domain}</span>
                        <span>${job.tasks.length} tasks</span>
                    </div>
                `;

				jobsContainer.appendChild(jobElement);
			});
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

			try {
				const response = await fetch(
					`/api/project-structure/${this.currentWorkspace}`
				);
				const data = await response.json();
				this.renderTree(
					data.structure,
					document.getElementById('structure-tree')
				);
			} catch (error) {
				console.error('Failed to load structure:', error);
				document.getElementById('structure-tree').innerHTML =
					'<p>Failed to load project structure.</p>';
			}
		},

		renderTree(nodes, container) {
			container.innerHTML = '';

			const renderNode = (node) => {
				const element = document.createElement('div');
				element.className = `tree-node ${node.type}`;

				if (node.type === 'file') {
					element.onclick = () => this.showFilePreview(node.path);
					if (node.ext === 'md') {
						element.innerHTML = `<span>📄 ${node.name}</span>`;
					} else {
						element.innerHTML = `<span>📄 ${node.name}</span>`;
					}
				} else {
					element.innerHTML = `
                        <span>📁 ${node.name}</span>
                        <div class="tree-children" style="display: none;"></div>
                    `;
					element.onclick = () => {
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
				const response = await fetch(
					`/api/file?path=${this.currentWorkspace}/${path}`
				);
				const data = await response.json();

				const preview = document.getElementById('file-preview');
				preview.innerHTML = data.html ? data.html : `<pre>${data.raw}</pre>`;
				preview.className = 'markdown-preview';

				this.switchSection('preview');
				document.getElementById('preview-title').textContent = path.split('/').pop();
				document.getElementById('preview-path').textContent = path;
				this.currentFile = path;
			} catch (error) {
				console.error('Failed to preview file:', error);
			}
		},

		bindEvents() {
			// Additional event bindings can go here
		},
	};

	// Initialize the app
	app.init();
});
