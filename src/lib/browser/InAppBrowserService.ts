import { Browser } from '@capacitor/browser';

class InAppBrowserService {
  /**
   * Open URL in built-in browser
   */
  async openUrl(url: string, options?: {
    toolbarColor?: string;
    presentationStyle?: 'popover' | 'fullscreen';
  }): Promise<void> {
    try {
      await Browser.open({
        url,
        toolbarColor: options?.toolbarColor || '#FF7900',
        presentationStyle: options?.presentationStyle || 'fullscreen',
        windowName: '_self',
      });
    } catch (error) {
      console.error('Failed to open URL:', error);
      throw error;
    }
  }

  /**
   * Open documentation
   */
  async openDocumentation(page: string = ''): Promise<void> {
    const baseUrl = 'https://docs.cri-blo.com';
    const url = page ? `${baseUrl}/${page}` : baseUrl;
    await this.openUrl(url);
  }

  /**
   * Open support form
   */
  async openSupport(): Promise<void> {
    await this.openUrl('https://support.cri-blo.com');
  }

  /**
   * Open training materials
   */
  async openTraining(): Promise<void> {
    await this.openUrl('https://training.cri-blo.com');
  }

  /**
   * Open external link safely
   */
  async openExternalLink(url: string): Promise<void> {
    // Validate URL
    try {
      new URL(url);
      await this.openUrl(url);
    } catch {
      throw new Error('Invalid URL');
    }
  }
}

export const inAppBrowserService = new InAppBrowserService();
export default InAppBrowserService;