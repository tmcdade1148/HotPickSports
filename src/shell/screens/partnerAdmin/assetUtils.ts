// Image upload / validation / library helpers + the `slugify` util for the
// Partner Admin surface. Extracted verbatim from PartnerAdminScreen — pure
// functions with no React/component coupling (they only touch supabase storage
// and react-native's Image/Alert). Behaviour is unchanged.
import {Image, Alert} from 'react-native';
import {supabase} from '@shared/config/supabase';

// react-native-image-picker returns `asset.type` inconsistently across
// platforms: MIME on Android, sometimes a UTI like `public.png` on iOS,
// `image/jpg` instead of `image/jpeg`, or empty. Accept either a MIME or
// a file-extension match so a real PNG isn't rejected for label drift.
export const LOGO_BUCKET = 'partner-logos';

export const ALLOWED_MIME: readonly string[] = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
export const ALLOWED_EXT = /\.(png|jpe?g|webp)$/i;

export const LOGO_MAX_BYTES   = 2 * 1024 * 1024;
export const BANNER_MAX_BYTES = 3 * 1024 * 1024;
export const BANNER_RATIO     = 1200 / 630; // 1.9047…
export const BANNER_RATIO_TOLERANCE = 0.05;

export interface PickedImage {
  uri: string;
  fileName: string;
  type: string;
  width: number;
  height: number;
  fileSize: number;
}

export interface LibraryItem {
  name: string;       // basename within _library, e.g. 'mes-que.png'
  displayName: string;
  url: string;        // canonical public URL — what gets saved on partner
  updatedAt: string;  // for cache-busting at render time only
}

export function libraryItemUrl(prefix: string, name: string): string {
  const {data} = supabase.storage.from(LOGO_BUCKET).getPublicUrl(`${prefix}/${name}`);
  return data.publicUrl;
}

export function fileNameSlug(input: string): string {
  const dot = input.lastIndexOf('.');
  const base = dot > 0 ? input.slice(0, dot) : input;
  const ext  = dot > 0 ? input.slice(dot + 1).toLowerCase() : 'png';
  const slug = base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'logo';
  return `${slug}.${ext}`;
}

export async function probeImageSize(url: string): Promise<{w: number; h: number} | null> {
  return new Promise(resolve => {
    Image.getSize(url, (w, h) => resolve({w, h}), () => resolve(null));
  });
}

export async function uploadRemoteUrlToLibrary(prefix: string, url: string): Promise<string | null> {
  if (!/^https?:\/\//i.test(url)) {
    Alert.alert('URL Rejected', 'URL must start with http:// or https://.');
    return null;
  }

  const dims = await probeImageSize(url);
  if (!dims) {
    Alert.alert('Fetch Failed', "Couldn't load the image. Is the URL public and reachable?");
    return null;
  }
  if (dims.w !== dims.h) {
    Alert.alert('Not Square', `Logo must be square. URL image is ${dims.w}×${dims.h}.`);
    return null;
  }

  const response = await fetch(url);
  if (!response.ok) {
    Alert.alert('Fetch Failed', `HTTP ${response.status}.`);
    return null;
  }
  const blob = await response.blob();

  if (blob.size > LOGO_MAX_BYTES) {
    Alert.alert('Too Large', `Image is ${(blob.size / 1024 / 1024).toFixed(2)}MB. Max 2MB.`);
    return null;
  }
  if (!ALLOWED_MIME.includes(blob.type.toLowerCase())) {
    Alert.alert('Format Rejected', `Got "${blob.type || 'unknown'}". Need PNG, JPG, or WebP.`);
    return null;
  }

  const cleanPath = url.split('?')[0];
  const lastSegment = cleanPath.split('/').pop() || 'logo.png';
  const ext = (lastSegment.split('.').pop() || 'png').toLowerCase();
  const basename = fileNameSlug(lastSegment).replace(/\.[^.]+$/, '');
  const storagePath = `${prefix}/${basename}.${ext}`;

  const {error} = await supabase.storage
    .from(LOGO_BUCKET)
    .upload(storagePath, blob, {contentType: blob.type, upsert: true});

  if (error) {
    Alert.alert('Upload Error', error.message);
    return null;
  }

  const {data} = supabase.storage.from(LOGO_BUCKET).getPublicUrl(storagePath);
  return data.publicUrl;
}

export async function listLibraryItems(prefix: string): Promise<LibraryItem[]> {
  const {data, error} = await supabase
    .storage
    .from(LOGO_BUCKET)
    .list(prefix, {limit: 200, sortBy: {column: 'updated_at', order: 'desc'}});
  if (error || !data) return [];
  return data
    .filter(o => o.name && !o.name.endsWith('/'))
    .map(o => ({
      name: o.name,
      displayName: o.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '),
      url: libraryItemUrl(prefix, o.name),
      updatedAt: o.updated_at ?? '',
    }));
}

export async function deleteLibraryItem(prefix: string, name: string): Promise<boolean> {
  const {error} = await supabase
    .storage
    .from(LOGO_BUCKET)
    .remove([`${prefix}/${name}`]);
  if (error) {
    Alert.alert('Delete Failed', error.message);
    return false;
  }
  return true;
}

export function hasAllowedFormat(a: PickedImage): boolean {
  return ALLOWED_MIME.includes(a.type.toLowerCase()) || ALLOWED_EXT.test(a.fileName);
}

export function validateLogoAsset(a: PickedImage): string | null {
  if (!hasAllowedFormat(a)) {
    return `Logo must be PNG, JPG, or WebP. Got "${a.type || 'unknown'}" / "${a.fileName}".`;
  }
  if (a.fileSize > LOGO_MAX_BYTES) return 'Logo must be 2MB or smaller.';
  if (a.width !== a.height) return `Logo must be square. You picked ${a.width}×${a.height}.`;
  return null;
}

export function validateBannerAsset(a: PickedImage): string | null {
  if (!hasAllowedFormat(a)) {
    return `Banner must be PNG, JPG, or WebP. Got "${a.type || 'unknown'}" / "${a.fileName}".`;
  }
  if (a.fileSize > BANNER_MAX_BYTES) return 'Banner must be 3MB or smaller.';
  const ratio = a.width / a.height;
  if (Math.abs(ratio - BANNER_RATIO) / BANNER_RATIO > BANNER_RATIO_TOLERANCE) {
    return `Banner must be ~1.91:1 (e.g. 1200×630). You picked ${a.width}×${a.height}.`;
  }
  return null;
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// pathPrefix is the partner's slug folder (or partner.id for banner).
// basename is the file basename within the prefix — slugified for logos
// so the library shows readable names; just "banner" for banners.
export async function uploadPartnerImage(
  pathPrefix: string,
  basename: string,
  uri: string,
  fileName: string,
): Promise<string | null> {
  try {
    const ext = fileName.split('.').pop()?.toLowerCase() || 'png';
    const storagePath = `${pathPrefix}/${basename}.${ext}`;
    const mimeType = `image/${ext === 'jpg' ? 'jpeg' : ext}`;

    // Get auth token for the upload
    const {data: {session}} = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) {
      Alert.alert('Upload Error', 'Not authenticated');
      return null;
    }

    // React Native: upload directly via REST API using fetch + FormData
    const SUPABASE_URL = 'https://mzqtrpdiqhopjmxjccwy.supabase.co';
    const uploadUrl = `${SUPABASE_URL}/storage/v1/object/${LOGO_BUCKET}/${storagePath}`;

    const formData = new FormData();
    formData.append('file', {
      uri,
      name: `${basename}.${ext}`,
      type: mimeType,
    } as any);

    const uploadResponse = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'x-upsert': 'true',
      },
      body: formData,
    });

    if (!uploadResponse.ok) {
      const errText = await uploadResponse.text();
      console.warn('Logo upload error:', errText);
      Alert.alert('Upload Error', `${uploadResponse.status}: ${errText}`);
      return null;
    }

    const {data} = supabase.storage
      .from(LOGO_BUCKET)
      .getPublicUrl(storagePath);

    return data.publicUrl;
  } catch (err: any) {
    console.warn('Logo upload failed:', err);
    Alert.alert('Upload Error', err?.message || 'Unknown error');
    return null;
  }
}
