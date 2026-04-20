<?php
/**
 * Plugin Name: SVG Library Media Tab
 * Description: Voegt automatisch een svg library toe aan de media modal.
 * Version: 1.0.0
 * Author: Burobrein
 * Requires at least: 6.0
 * Requires PHP: 7.4
 * Text Domain: svg-uploader
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class SVG_Uploader_Plugin {
	/**
	 * Boot the plugin hooks.
	 */
	public static function init() {
		add_action( 'admin_enqueue_scripts', array( __CLASS__, 'enqueue_assets' ) );
		add_filter( 'upload_mimes', array( __CLASS__, 'allow_svg_uploads' ) );
		add_filter( 'wp_check_filetype_and_ext', array( __CLASS__, 'fix_svg_filetype' ), 10, 4 );
		add_filter( 'wp_prevent_unsupported_mime_type_uploads', array( __CLASS__, 'allow_unsupported_svg_mime' ), 10, 2 );
	}

	/**
	 * Enqueue assets only on post editor screens.
	 *
	 * @param string $hook_suffix Current admin page hook.
	 */
	public static function enqueue_assets( $hook_suffix ) {
		if ( ! in_array( $hook_suffix, array( 'post.php', 'post-new.php' ), true ) ) {
			return;
		}

		wp_enqueue_media();

		$script_path = plugin_dir_path( __FILE__ ) . 'js/svg-media-tab.js';
		$script_url  = plugin_dir_url( __FILE__ ) . 'js/svg-media-tab.js';
		$style_path  = plugin_dir_path( __FILE__ ) . 'css/svg-media-tab.css';
		$style_url   = plugin_dir_url( __FILE__ ) . 'css/svg-media-tab.css';

		wp_enqueue_style(
			'svg-uploader-media-tab',
			$style_url,
			array(),
			file_exists( $style_path ) ? filemtime( $style_path ) : '1.0.0'
		);

		wp_enqueue_script(
			'svg-uploader-media-tab',
			$script_url,
			array( 'media-views', 'wp-api-fetch', 'wp-blocks', 'wp-data', 'wp-element', 'wp-i18n' ),
			file_exists( $script_path ) ? filemtime( $script_path ) : '1.0.0',
			true
		);

		wp_localize_script(
			'svg-uploader-media-tab',
			'SVGUploaderData',
			array(
				'title'    => __( 'SVG Library', 'svg-uploader' ),
				'iconsUrl' => plugin_dir_url( __FILE__ ) . 'data/icon-nodes.json',
				'uploadUrl' => esc_url_raw( rest_url( 'wp/v2/media' ) ),
				'nonce'    => wp_create_nonce( 'wp_rest' ),
				'i18n'     => array(
					'insert'            => __( 'Insert', 'svg-uploader' ),
					'inserting'         => __( 'Uploading…', 'svg-uploader' ),
					'colorLabel'        => __( 'Icon Color', 'svg-uploader' ),
					'strokeLabel'       => __( 'Stroke Width', 'svg-uploader' ),
					'sizeLabel'         => __( 'Size (px)', 'svg-uploader' ),
					'searchLabel'       => __( 'Search Icons', 'svg-uploader' ),
					'searchPlaceholder' => __( 'Search Lucide icons…', 'svg-uploader' ),
					'description'       => __( 'Browse the bundled Lucide icon library, tweak the color, and insert an inline SVG.', 'svg-uploader' ),
					'loading'           => __( 'Loading Lucide icons…', 'svg-uploader' ),
					'empty'             => __( 'No icons matched your search.', 'svg-uploader' ),
					'loadMore'          => __( 'Load More', 'svg-uploader' ),
					'uploadError'       => __( 'The SVG could not be uploaded to the media library.', 'svg-uploader' ),
				),
			)
		);
	}

	/**
	 * Allow SVG uploads for users who can upload files.
	 *
	 * @param array<string, string> $mimes Allowed mime types.
	 * @return array<string, string>
	 */
	public static function allow_svg_uploads( $mimes ) {
		if ( current_user_can( 'upload_files' ) ) {
			$mimes['svg'] = 'image/svg+xml';
		}

		return $mimes;
	}

	/**
	 * Ensure WordPress recognizes SVG uploads correctly.
	 *
	 * @param array<string, mixed> $data     File data array.
	 * @param string               $file     Full path to the file.
	 * @param string               $filename File name.
	 * @param array<string, mixed> $mimes    Allowed mime types.
	 * @return array<string, mixed>
	 */
	public static function fix_svg_filetype( $data, $file, $filename, $mimes ) {
		$ext = strtolower( pathinfo( $filename, PATHINFO_EXTENSION ) );

		if ( 'svg' !== $ext ) {
			return $data;
		}

		$data['ext']  = 'svg';
		$data['type'] = 'image/svg+xml';

		if ( ! isset( $data['proper_filename'] ) ) {
			$data['proper_filename'] = $filename;
		}

		return $data;
	}

	/**
	 * Allow SVG through the unsupported image mime guard used by the media REST API.
	 *
	 * @param bool        $prevent   Whether unsupported mime types should be blocked.
	 * @param string|null $mime_type The current file mime type.
	 * @return bool
	 */
	public static function allow_unsupported_svg_mime( $prevent, $mime_type ) {
		if ( 'image/svg+xml' === $mime_type ) {
			return false;
		}

		return $prevent;
	}
}

SVG_Uploader_Plugin::init();
