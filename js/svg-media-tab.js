( ( wp, settings ) => {
	if (
		! wp ||
		! wp.media ||
		! wp.media.view ||
		! wp.media.view.MediaFrame ||
		! wp.media.view.MediaFrame.Select ||
		! settings
	) {
		return;
	}

	const __ = ( value ) => value;
	const SelectFrame = wp.media.view.MediaFrame.Select;
	const selectPrototype = SelectFrame.prototype;

	if ( selectPrototype.__svgLibraryPatched ) {
		return;
	}

	const svgStateId = 'svg-library';
	const PAGE_SIZE = 120;
	let lucideIconsPromise = null;
	const ICON_LOAD_TIMEOUT = 10000;

	const toggleFooterSelectButton = ( frame, disabled ) => {
		const button = frame?.el?.querySelector?.(
			'.media-frame-toolbar .media-toolbar-primary .media-button-select'
		);

		if ( ! button ) {
			return;
		}

		button.disabled = disabled;
		button.setAttribute( 'aria-disabled', disabled ? 'true' : 'false' );
		button.classList.toggle( 'disabled', disabled );
	};

	const toggleFooterToolbar = ( frame, hidden ) => {
		const frameElement = frame?.el;
		const toolbar = frame?.el?.querySelector?.( '.media-frame-toolbar' );

		if ( frameElement ) {
			frameElement.classList.toggle( 'svg-library-state-active', hidden );
		}

		if ( ! toolbar ) {
			return;
		}

		if ( hidden ) {
			toolbar.style.setProperty( 'display', 'none', 'important' );
			toolbar.setAttribute( 'aria-hidden', 'true' );
			return;
		}

		toolbar.style.removeProperty( 'display' );
		toolbar.removeAttribute( 'aria-hidden' );
	};

	const escapeAttribute = ( value ) =>
		String( value )
			.replace( /&/g, '&amp;' )
			.replace( /"/g, '&quot;' )
			.replace( /'/g, '&#39;' )
			.replace( /</g, '&lt;' )
			.replace( />/g, '&gt;' );

	const titleize = ( slug ) =>
		slug
			.split( '-' )
			.map( ( part ) => part.charAt( 0 ).toUpperCase() + part.slice( 1 ) )
			.join( ' ' );

	const loadLucideIcons = () => {
		if ( lucideIconsPromise ) {
			return lucideIconsPromise;
		}

		const controller = typeof window.AbortController === 'function'
			? new window.AbortController()
			: null;
		const timeoutId = window.setTimeout( () => {
			controller?.abort();
		}, ICON_LOAD_TIMEOUT );

		lucideIconsPromise = window
			.fetch( settings.iconsUrl, {
				credentials: 'same-origin',
				signal: controller?.signal,
				cache: 'no-store',
			} )
			.then( ( response ) => {
				if ( ! response.ok ) {
					throw new Error( `Unable to load Lucide icons: ${ response.status }` );
				}

				return response.json();
			} )
			.then( ( iconsMap ) =>
				Object.entries( iconsMap ).map( ( [ id, nodes ] ) => ( {
					id,
					label: titleize( id ),
					nodes: Array.isArray( nodes ) ? nodes : [],
				} ) )
			)
			.catch( ( error ) => {
				lucideIconsPromise = null;
				throw error;
			} )
			.finally( () => {
				window.clearTimeout( timeoutId );
			} );

		return lucideIconsPromise;
	};

	const buildSvgChildren = ( icon ) =>
		( icon.nodes || [] )
			.map( ( [ tagName, attributes ] ) => {
				const safeAttributes = Object.entries( attributes || {} )
					.map(
						( [ key, value ] ) =>
							`${ escapeAttribute( key ) }="${ escapeAttribute( value ) }"`
					)
					.join( ' ' );

				return `<${ tagName } ${ safeAttributes }></${ tagName }>`;
			} )
			.join( '' );

	const buildSvgMarkup = ( icon, color, strokeWidth = 2, size = 96 ) => {
		const safeColor = escapeAttribute( color );
		const safeLabel = escapeAttribute( icon.label || icon.id );
		const safeStrokeWidth = escapeAttribute( strokeWidth );
		const safeSize = escapeAttribute( size );

		return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${ safeSize }" height="${ safeSize }" fill="none" stroke="${ safeColor }" stroke-width="${ safeStrokeWidth }" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="${ safeLabel }" style="display:block;">${ buildSvgChildren( icon ) }</svg>`;
	};

	const getReturnState = ( frame ) => {
		if ( ! frame?.states ) {
			return null;
		}

		const preferredStateId = frame.svgLibraryReturnStateId;

		if ( preferredStateId && preferredStateId !== svgStateId ) {
			const preferredState = frame.states.get( preferredStateId );

			if ( preferredState ) {
				return preferredState;
			}
		}

		return (
			frame.states.find( ( candidateState ) => {
				if ( ! candidateState || candidateState.get( 'id' ) === svgStateId ) {
					return false;
				}

				return Boolean( candidateState.get( 'selection' ) );
			} ) || null
		);
	};

	const handOffUploadedMediaSelection = async ( frame, media ) => {
		if ( ! frame || ! media?.id ) {
			return;
		}

		const attachment = wp.media.attachment( media.id );
		const normalizedMedia = {
			...media,
			url: media.source_url || media.url,
			alt: media.alt_text || media.alt,
			filename: media.media_details?.file || media.slug || media.id,
			type: 'image',
			subtype: media.mime_type?.replace( 'image/', '' ) || 'svg+xml',
		};

		attachment.set( normalizedMedia );

		try {
			await attachment.fetch();
		} catch ( error ) {
			attachment.set( normalizedMedia );
		}

		const syncSelection = ( selection ) => {
			if ( ! selection ) {
				return;
			}

			selection.reset( [ attachment ] );
			selection.single( attachment );
		};

		syncSelection( frame.options?.selection );

		const state = frame.state();
		syncSelection( state?.get( 'selection' ) );

		if ( frame.states?.models ) {
			frame.states.models.forEach( ( candidateState ) => {
				if ( candidateState === state ) {
					return;
				}

				syncSelection( candidateState.get?.( 'selection' ) );
			} );
		}

		if ( frame._selection?.attachments ) {
			frame._selection.attachments.reset( [ attachment ] );
			frame._selection.single = attachment;
		}

		const returnState = getReturnState( frame );

		if ( returnState && returnState !== state ) {
			frame.setState( returnState.get( 'id' ) );
		}

		window.requestAnimationFrame( () => {
			const activeState = frame.state();
			syncSelection( frame.options?.selection );
			syncSelection( activeState?.get( 'selection' ) );

			if ( frame._selection?.attachments ) {
				frame._selection.attachments.reset( [ attachment ] );
				frame._selection.single = attachment;
			}

			activeState?.trigger( 'select' );
			frame.trigger( 'select' );
			frame.close();
		} );
	};

	const uploadSvgToMediaLibrary = async ( selection ) => {
		if ( ! selection?.markup || ! settings.uploadUrl || ! settings.nonce ) {
			throw new Error( 'Missing upload settings.' );
		}

		const svgDocument = `<?xml version="1.0" encoding="UTF-8"?>\n${ selection.markup }`;
		const svgBlob = new Blob( [ svgDocument ], { type: 'image/svg+xml' } );
		const formData = new window.FormData();
		const filename = `${ selection.id || 'lucide-icon' }.svg`;

		formData.append( 'file', svgBlob, filename );
		formData.append( 'title', selection.label || selection.id || 'Lucide Icon' );
		formData.append( 'alt_text', selection.label || selection.id || 'Lucide Icon' );

		const response = await window.fetch( settings.uploadUrl, {
			method: 'POST',
			credentials: 'same-origin',
			headers: {
				'X-WP-Nonce': settings.nonce,
			},
			body: formData,
		} );

		if ( ! response.ok ) {
			let message = `Upload failed: ${ response.status }`;

			try {
				const errorData = await response.json();
				message = errorData?.message || errorData?.code || message;
			} catch ( error ) {
				try {
					message = await response.text();
				} catch ( readError ) {
					// Keep the fallback message.
				}
			}

			throw new Error( message );
		}

		return response.json();
	};

	const SvgLibraryView = wp.media.View.extend( {
		className: 'svg-library-tab-content',

		events: {
			'click .svg-library-card': 'handleSelect',
			'click .svg-library-insert': 'handleInsert',
			'input .svg-library-color-picker': 'handleColorChange',
			'change .svg-library-color-picker': 'handleColorChange',
			'input .svg-library-stroke-width': 'handleStrokeWidthChange',
			'change .svg-library-stroke-width': 'handleStrokeWidthChange',
			'input .svg-library-size': 'handleSizeChange',
			'change .svg-library-size': 'handleSizeChange',
			'input .svg-library-search': 'handleSearch',
			'click .svg-library-load-more': 'handleLoadMore',
		},

		initialize( options = {} ) {
			wp.media.View.prototype.initialize.apply( this, arguments );

			this.frame = options.frame;
			this.icons = [];
			this.filteredIcons = [];
			this.selectedId = null;
			this.color = '#0f172a';
			this.strokeWidth = 2;
			this.size = 96;
			this.searchTerm = '';
			this.visibleCount = PAGE_SIZE;
			this.loading = true;
			this.loadError = false;
			this.isUploading = false;

			this.frame.svgLibrarySelection = null;
			this.frame.svgLibraryContentView = this;

			loadLucideIcons()
				.then( ( icons ) => {
					this.icons = icons;
					this.selectedId = null;
					this.loading = false;
					this.loadError = false;
					this.syncSelection();
					this.render();
				} )
				.catch( () => {
					this.loading = false;
					this.loadError = true;
					this.syncSelection();
					this.render();
				} );
		},

		getVisibleIcons() {
			const needle = this.searchTerm.trim().toLowerCase();
			const filtered = needle
				? this.icons.filter(
						( icon ) =>
							icon.id.includes( needle ) || icon.label.toLowerCase().includes( needle )
				  )
				: this.icons;

			this.filteredIcons = filtered;

			if ( this.selectedId && ! filtered.some( ( icon ) => icon.id === this.selectedId ) ) {
				this.selectedId = null;
				this.syncSelection();
			}

			return filtered.slice( 0, this.visibleCount );
		},

		renderStatus() {
			if ( this.loading ) {
				return `<svg class="icon-error" fill="#56e39f" width="80px" height="80px" viewBox="0 0 36 36" version="1.1"  preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
    <title>sad-face-line</title>
    <path d="M18,2A16,16,0,1,0,34,18,16,16,0,0,0,18,2Zm0,30A14,14,0,1,1,32,18,14,14,0,0,1,18,32Z" class="clr-i-outline clr-i-outline-path-1"></path><circle cx="25.16" cy="14.28" r="1.8" class="clr-i-outline clr-i-outline-path-2"></circle><circle cx="11.41" cy="14.28" r="1.8" class="clr-i-outline clr-i-outline-path-3"></circle><path d="M18.16,20a9,9,0,0,0-7.33,3.78,1,1,0,1,0,1.63,1.16,7,7,0,0,1,11.31-.13,1,1,0,0,0,1.6-1.2A9,9,0,0,0,18.16,20Z" class="clr-i-outline clr-i-outline-path-4"></path>
    <rect x="0" y="0" width="36" height="36" fill-opacity="0"/>
</svg><p class="svg-library-status">${ escapeAttribute( __( 'Lucide icons laden…', 'svg-uploader' ) ) }</p>`;
			}

			if ( this.loadError ) {
				return `<svg class="icon-error" fill="#56e39f" width="80px" height="80px" viewBox="0 0 36 36" version="1.1"  preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
    <title>sad-face-line</title>
    <path d="M18,2A16,16,0,1,0,34,18,16,16,0,0,0,18,2Zm0,30A14,14,0,1,1,32,18,14,14,0,0,1,18,32Z" class="clr-i-outline clr-i-outline-path-1"></path><circle cx="25.16" cy="14.28" r="1.8" class="clr-i-outline clr-i-outline-path-2"></circle><circle cx="11.41" cy="14.28" r="1.8" class="clr-i-outline clr-i-outline-path-3"></circle><path d="M18.16,20a9,9,0,0,0-7.33,3.78,1,1,0,1,0,1.63,1.16,7,7,0,0,1,11.31-.13,1,1,0,0,0,1.6-1.2A9,9,0,0,0,18.16,20Z" class="clr-i-outline clr-i-outline-path-4"></path>
    <rect x="0" y="0" width="36" height="36" fill-opacity="0"/>
</svg><p class="svg-library-status">${ escapeAttribute( __( 'Geen icons gevonden.', 'svg-uploader' ) ) }</p>`;
			}

			return '';
		},

		renderGrid() {
			if ( this.loading || this.loadError ) {
				return '';
			}

			const icons = this.getVisibleIcons();

			if ( ! icons.length ) {
				return `<svg class="icon-error" fill="#56e39f" width="80px4" height="80px" viewBox="0 0 36 36" version="1.1"  preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
    <title>sad-face-line</title>
    <path d="M18,2A16,16,0,1,0,34,18,16,16,0,0,0,18,2Zm0,30A14,14,0,1,1,32,18,14,14,0,0,1,18,32Z" class="clr-i-outline clr-i-outline-path-1"></path><circle cx="25.16" cy="14.28" r="1.8" class="clr-i-outline clr-i-outline-path-2"></circle><circle cx="11.41" cy="14.28" r="1.8" class="clr-i-outline clr-i-outline-path-3"></circle><path d="M18.16,20a9,9,0,0,0-7.33,3.78,1,1,0,1,0,1.63,1.16,7,7,0,0,1,11.31-.13,1,1,0,0,0,1.6-1.2A9,9,0,0,0,18.16,20Z" class="clr-i-outline clr-i-outline-path-4"></path>
    <rect x="0" y="0" width="36" height="36" fill-opacity="0"/>
</svg><p class="svg-library-status">${ escapeAttribute( __( 'Geen icons gevonden.', 'svg-uploader' ) ) }</p>`;
			}

			const cards = icons
				.map( ( icon ) => {
					const isSelected = icon.id === this.selectedId;

					return `
						<button
							type="button"
							class="svg-library-card${ isSelected ? ' is-selected' : '' }"
							data-svg-id="${ escapeAttribute( icon.id ) }"
							aria-pressed="${ isSelected ? 'true' : 'false' }"
						>
							<span class="svg-library-preview">${ buildSvgMarkup( icon, this.color, this.strokeWidth, this.size ) }</span>
							<span class="svg-library-name">${ escapeAttribute( icon.label ) }</span>
						</button>
					`;
				} )
				.join( '' );

			const canLoadMore = this.filteredIcons.length > icons.length;
			const loadMoreButton = canLoadMore
				? `<button type="button" class="button button-secondary svg-library-load-more">${ escapeAttribute( __( 'Load More', 'svg-uploader' ) ) }</button>`
				: '';

			return `
				<div class="svg-library-grid">${ cards }</div>
				<div class="svg-library-footer">
					${ loadMoreButton }
				</div>
			`;
		},

		render() {
			const previousShell = this.el.querySelector( '.svg-library-shell' );
			const previousScrollTop = previousShell ? previousShell.scrollTop : 0;
			const previousScrollLeft = previousShell ? previousShell.scrollLeft : 0;
			const activeElement = document.activeElement;
			const restoreSearchFocus =
				activeElement &&
				activeElement.classList &&
				activeElement.classList.contains( 'svg-library-search' );
			const restoreColorFocus =
				activeElement &&
				activeElement.classList &&
				activeElement.classList.contains( 'svg-library-color-picker' );
			const restoreStrokeFocus =
				activeElement &&
				activeElement.classList &&
				activeElement.classList.contains( 'svg-library-stroke-width' );
			const restoreSizeFocus =
				activeElement &&
				activeElement.classList &&
				activeElement.classList.contains( 'svg-library-size' );
			const searchSelectionStart = restoreSearchFocus ? activeElement.selectionStart : null;
			const searchSelectionEnd = restoreSearchFocus ? activeElement.selectionEnd : null;

			this.el.innerHTML = `
				<div class="svg-library-shell">
					<div class="svg-search-container">
							<input id="svg-library-search" class="svg-library-search" type="search" value="${ escapeAttribute( this.searchTerm ) }" placeholder="${ escapeAttribute( __( 'Zoek 1695 icons…', 'svg-uploader' ) ) }" />
	
					</div>
					<div class="main-container-library">
					<div class="svg-library-container">
					<div class="svg-library-toolbar">
					
						<div class="svg-library-field">
												    <div class="svg-library-flex">

							<label for="svg-library-stroke-width">${ escapeAttribute( __( 'Stroke Width', 'svg-uploader' ) ) }</label>
							<p>${ escapeAttribute( this.strokeWidth ) }px</p>

							</div>
							<input id="svg-library-stroke-width" class="svg-library-slider svg-library-stroke-width" type="range" min="0.5" max="4" step="0.5" value="${ escapeAttribute( this.strokeWidth ) }" />
						</div>
						<div class="svg-library-field">
						    <div class="svg-library-flex">
							<label for="svg-library-size">${ escapeAttribute( __( 'Size', 'svg-uploader' ) ) }</label>
							<p>${ escapeAttribute( this.size ) }px</p>
							</div>
							<input id="svg-library-size" class="svg-library-slider svg-library-size" type="range" min="16" max="96" step="4" value="${ escapeAttribute( this.size ) }" />
						</div>
						<div class="svg-library-field">

						    <div class="svg-library-flex color-wrap">
							<label for="svg-uploader">${ escapeAttribute( __( 'Icon color', 'svg-uploader' ) ) }</label>


						<div class="color-picker-wrapper">

						
						    <p>${ escapeAttribute( this.color ) }</p>
							<div class="cp_wrapper">
						
							<input id="svg-library-color-picker" class="svg-library-color-picker" type="color" value="${ escapeAttribute( this.color ) }" />
						
						</div>


						</div>
							</div>
					
					
																<button
								type="button"
								class="button button-primary svg-library-insert"
								${ this.frame.svgLibrarySelection && ! this.isUploading ? '' : 'disabled' }
							>
								${ escapeAttribute( this.isUploading ? __( 'Uploading…', 'svg-uploader' ) : __( 'Voeg icon toe +', 'svg-uploader' ) ) }
							</button>
						</div>
					</div>

</div>
					<div class="svg-library-grid-container">		
					${ this.renderStatus() }
					${ this.renderGrid() }
					</div>
					</div>
				</div>
			`;

			if ( restoreSearchFocus ) {
				const searchInput = this.el.querySelector( '.svg-library-search' );

				if ( searchInput ) {
					searchInput.focus();

					if (
						typeof searchSelectionStart === 'number' &&
						typeof searchSelectionEnd === 'number'
					) {
						searchInput.setSelectionRange( searchSelectionStart, searchSelectionEnd );
					}
				}
			}

			if ( restoreColorFocus ) {
				const colorInput = this.el.querySelector( '.svg-library-color-picker' );

				if ( colorInput ) {
					colorInput.focus();
				}
			}

			if ( restoreStrokeFocus ) {
				const strokeInput = this.el.querySelector( '.svg-library-stroke-width' );

				if ( strokeInput ) {
					strokeInput.focus();
				}
			}

			if ( restoreSizeFocus ) {
				const sizeInput = this.el.querySelector( '.svg-library-size' );

				if ( sizeInput ) {
					sizeInput.focus();
				}
			}

			const nextShell = this.el.querySelector( '.svg-library-shell' );

			if ( nextShell ) {
				nextShell.scrollTop = previousScrollTop;
				nextShell.scrollLeft = previousScrollLeft;
			}

			return this;
		},

		handleSelect( event ) {
			const nextId = event.currentTarget.dataset.svgId;

			if ( ! nextId ) {
				return;
			}

			this.selectedId = nextId === this.selectedId ? null : nextId;
			this.syncSelection();
			this.render();
		},

		handleColorChange( event ) {
			this.color = event.currentTarget.value || '#0f172a';
			this.syncSelection();
			this.render();
		},

		handleStrokeWidthChange( event ) {
			const nextValue = Number.parseFloat( event.currentTarget.value );
			this.strokeWidth = Number.isFinite( nextValue )
				? Math.min( 8, Math.max( 0.5, nextValue ) )
				: 2;
			this.syncSelection();
			this.render();
		},

		handleSizeChange( event ) {
			const nextValue = Number.parseInt( event.currentTarget.value, 10 );
			this.size = Number.isFinite( nextValue )
				? Math.min( 512, Math.max( 12, nextValue ) )
				: 96;
			this.syncSelection();
			this.render();
		},

		handleSearch( event ) {
			this.searchTerm = event.currentTarget.value || '';
			this.visibleCount = PAGE_SIZE;
			this.render();
		},

		handleLoadMore() {
			this.visibleCount += PAGE_SIZE;
			this.render();
		},

		async handleInsert() {
			await this.uploadSelectedSvg();
		},

		async uploadSelectedSvg() {
			const selection = this.frame.svgLibrarySelection;

			if ( ! selection || ! selection.markup || this.isUploading ) {
				return;
			}

			this.isUploading = true;
			this.render();

			try {
				const media = await uploadSvgToMediaLibrary( selection );
				await handOffUploadedMediaSelection( this.frame, media );
			} catch ( error ) {
				const fallback = __( 'The SVG could not be uploaded to the media library.', 'svg-uploader' );
				window.alert( `${ fallback }\n\n${ error?.message || '' }`.trim() );
			} finally {
				this.isUploading = false;
				this.render();
			}
		},

		syncSelection() {
			const icon = this.icons.find( ( item ) => item.id === this.selectedId );

			this.frame.svgLibrarySelection = icon
				? {
						id: icon.id,
						label: icon.label,
						color: this.color,
						strokeWidth: this.strokeWidth,
						size: this.size,
						markup: buildSvgMarkup( icon, this.color, this.strokeWidth, this.size ),
				  }
				: null;
		},
	} );

	const originalInitialize = selectPrototype.initialize;
	const originalBrowseRouter = selectPrototype.browseRouter;
	const originalBindHandlers = selectPrototype.bindHandlers;
	const originalCreateSelectToolbar = selectPrototype.createSelectToolbar;
	const originalSetState = selectPrototype.setState;

	selectPrototype.initialize = function() {
		originalInitialize.apply( this, arguments );

		if ( this.states && ! this.states.get( svgStateId ) ) {
			this.states.add(
				new wp.media.controller.Library( {
					id: svgStateId,
					title: settings.title || __( 'SVG Library', 'svg-uploader' ),
					library: new wp.media.model.Attachments(),
					selection: new wp.media.model.Selection( [], { multiple: false } ),
					multiple: false,
					content: svgStateId,
					router: 'browse',
					toolbar: 'select',
					searchable: false,
					filterable: false,
					sortable: false,
					autoSelect: false,
					contentUserSetting: false,
					syncSelection: false,
					priority: 200,
				} )
			);
		}

		if ( ! this.svgLibraryFooterObserver && typeof window.MutationObserver === 'function' ) {
			this.svgLibraryFooterObserver = new window.MutationObserver( () => {
				if ( this.state()?.get?.( 'id' ) === svgStateId ) {
					toggleFooterToolbar( this, true );
					toggleFooterSelectButton( this, true );
					return;
				}

				toggleFooterToolbar( this, false );
			} );

			this.svgLibraryFooterObserver.observe( this.el, {
				subtree: true,
				attributes: true,
				attributeFilter: [ 'class', 'disabled', 'aria-disabled' ],
				childList: true,
			} );
		}
	};

	selectPrototype.browseRouter = function( routerView ) {
		originalBrowseRouter.apply( this, arguments );

		routerView.set( {
			[ svgStateId ]: {
				text: settings.title || __( 'SVG Library', 'svg-uploader' ),
				priority: 80,
			},
		} );
	};

	selectPrototype.bindHandlers = function() {
		originalBindHandlers.apply( this, arguments );

		this.on( `content:render:${ svgStateId }`, this.renderSvgLibraryTab, this );
		this.on( 'activate', this.captureSvgLibraryReturnState, this );
		this.on( `activate:${ svgStateId }`, this.disableSvgLibraryFooterButton, this );
	};

	selectPrototype.renderSvgLibraryTab = function() {
		const view = new SvgLibraryView( {
			controller: this,
			frame: this,
		} );

		this.svgLibraryContentView = view;
		this.content.set( view );
	};

	selectPrototype.createSelectToolbar = function( toolbar, options ) {
		if ( this.state().id !== svgStateId ) {
			return originalCreateSelectToolbar.apply( this, arguments );
		}

		toolbar.view = new wp.media.view.Toolbar.Select( {
			controller: this,
			text: __( 'Insert', 'svg-uploader' ),
			event: false,
			close: false,
			reset: false,
			requires: {
				selection: true,
			},
			items: {
				select: {
					style: 'primary',
					text: __( 'Insert', 'svg-uploader' ),
					priority: 80,
					requires: {
						selection: true,
					},
				},
			},
		} );

		const stateSelection = this.state().get( 'selection' );

		if ( stateSelection ) {
			stateSelection.reset();
		}

		window.requestAnimationFrame( () => {
			this.disableSvgLibraryFooterButton();
		} );
	};

	selectPrototype.setState = function() {
		const result = originalSetState.apply( this, arguments );

		window.requestAnimationFrame( () => {
			if ( this.state()?.get?.( 'id' ) === svgStateId ) {
				this.disableSvgLibraryFooterButton();
				return;
			}

			toggleFooterToolbar( this, false );
		} );

		return result;
	};

	selectPrototype.captureSvgLibraryReturnState = function() {
		const activeState = this.state();
		const activeStateId = activeState?.get?.( 'id' );

		if ( activeStateId && activeStateId !== svgStateId ) {
			this.svgLibraryReturnStateId = activeStateId;
		}
	};

	selectPrototype.disableSvgLibraryFooterButton = function() {
		if ( this.state()?.get?.( 'id' ) !== svgStateId ) {
			toggleFooterToolbar( this, false );
			return;
		}

		const selectToolbar = this.toolbar?.get?.( 'select' );
		const selectItem = selectToolbar?.get?.( 'select' );

		if ( selectItem?.model ) {
			selectItem.model.set( 'disabled', true );
		}

		toggleFooterToolbar( this, true );
		toggleFooterSelectButton( this, true );
	};

	selectPrototype.__svgLibraryPatched = true;
} )( window.wp, window.SVGUploaderData );
