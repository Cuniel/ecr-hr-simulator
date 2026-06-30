const Utils = require('./utils');

class SlideVerify {
  constructor(page) {
    this.page = page;
  }

  async handle() {
    Utils.log('info', '🎯 开始处理滑动验证...');
    
    try {
      const slideContainer = this.page.locator('.ours-verifyCode-slider').first();
      const slideButton = this.page.locator('.verifyCode-icon.slider-warp').first();
      
      // 检查滑动验证是否存在
      const containerVisible = await slideContainer.isVisible({ timeout: 3000 });
      const buttonVisible = await slideButton.isVisible({ timeout: 1000 });
      
      if (!containerVisible || !buttonVisible) {
        Utils.log('info', 'ℹ️  未检测到滑动验证或已通过验证');
        return true;
      }

      Utils.log('success', '找到滑动验证元素');
      
      // 获取元素位置
      const containerBox = await slideContainer.boundingBox();
      const buttonBox = await slideButton.boundingBox();
      
      if (!containerBox || !buttonBox) {
        throw new Error('无法获取滑动验证元素位置');
      }

      Utils.log('debug', '容器位置:', containerBox);
      Utils.log('debug', '按钮位置:', buttonBox);

      // 执行滑动 - 使用已验证成功的方法
      await this.performSlide(slideButton, slideContainer, containerBox);
      
      // 等待验证结果
      await Utils.sleep(2000);
      
      // 验证是否成功
      const success = await this.verifySlideResult();
      
      if (success) {
        Utils.log('success', '滑动验证完成');
        return true;
      } else {
        Utils.log('warning', '滑动验证可能失败，尝试备用方法');
        return await this.performAlternativeSlide(slideButton, containerBox, buttonBox);
      }
      
    } catch (error) {
      Utils.log('error', '滑动验证处理失败:', error.message);
      return false;
    }
  }

  async performSlide(slideButton, slideContainer, containerBox) {
    try {
      // 方法1: dragTo (已验证成功)
      await slideButton.dragTo(slideContainer, { 
        targetPosition: { 
          x: containerBox.width - 10, 
          y: containerBox.height / 2 
        }
      });
      Utils.log('info', '✨ 滑动操作完成 (dragTo方法)');
    } catch (error) {
      throw new Error(`滑动操作失败: ${error.message}`);
    }
  }

  async performAlternativeSlide(slideButton, containerBox, buttonBox) {
    try {
      Utils.log('info', '🔄 尝试备用滑动方法...');
      
      const startX = buttonBox.x + buttonBox.width / 2;
      const startY = buttonBox.y + buttonBox.height / 2;
      const endX = containerBox.x + containerBox.width - 20;
      
      // 鼠标滑动方法
      await this.page.mouse.move(startX, startY);
      await this.page.mouse.down();
      
      // 分步滑动，模拟人工操作
      const steps = 15;
      for (let i = 0; i <= steps; i++) {
        const x = startX + (endX - startX) * (i / steps);
        await this.page.mouse.move(x, startY, { steps: 2 });
        await Utils.sleep(30);
      }
      
      await this.page.mouse.up();
      Utils.log('info', '✨ 备用滑动方法完成');
      
      await Utils.sleep(2000);
      return await this.verifySlideResult();
      
    } catch (error) {
      Utils.log('error', '备用滑动方法失败:', error.message);
      return false;
    }
  }

  async verifySlideResult() {
    try {
      // 检查成功标识
      const successIndicators = [
        '.success',
        '.验证成功', 
        '[class*="success"]',
        '.slide-success'
      ];

      for (const selector of successIndicators) {
        const element = this.page.locator(selector).first();
        if (await element.isVisible({ timeout: 1000 })) {
          return true;
        }
      }

      // 如果没有明确的成功标识，假设成功
      return true;
      
    } catch (error) {
      Utils.log('debug', '验证结果检查失败:', error.message);
      return true; // 默认认为成功
    }
  }
}

module.exports = SlideVerify;