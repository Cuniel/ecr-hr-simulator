const Utils = require('./utils');

class ClockIn {
  constructor(page) {
    this.page = page;
    this.config = Utils.loadConfig();
  }

  async perform() {
    Utils.log('info', '📍 开始打卡流程...');
    
    try {
      // 访问打卡页面
      await this.accessClockInPage();
      
      // 检查考勤范围
      const inRange = await this.checkAttendanceRange();
      if (!inRange) {
        Utils.log('error', '不在考勤范围内，无法打卡');
        return false;
      }
      
      // 查找并点击打卡按钮
      const success = await this.executeClockIn();
      
      if (success) {
        Utils.log('success', '🎉 打卡成功！');
        return true;
      } else {
        Utils.log('error', '打卡失败');
        return false;
      }
      
    } catch (error) {
      Utils.log('error', '打卡流程异常:', error.message);
      
      // 保存错误截图
      await Utils.saveScreenshot(this.page, `clockin-error-${Utils.getCurrentTimestamp()}.png`);
      
      return false;
    }
  }

  async accessClockInPage() {
    Utils.log('info', '🌐 访问打卡页面...');
    
    await this.page.goto('https://ecr-hr.ecloudrover.com/ehr/attendance/data.do?method=index');
    await this.page.waitForLoadState('domcontentloaded');
    
    // 等待页面完全加载
    await Utils.sleep(3000);
    
    // 保存页面状态截图
    await Utils.saveScreenshot(this.page, `clockin-page-${Utils.getCurrentTimestamp()}.png`);
    
    Utils.log('success', '打卡页面加载完成');
  }

  async checkAttendanceRange() {
    Utils.log('info', '🌍 检查考勤范围状态...');
    
    try {
      // 查找考勤范围内的提示
      const inRangeTexts = [
        '已在考勤范围内',
        '已在考勤范围',
        '范围内'
      ];

      for (const text of inRangeTexts) {
        const elements = await this.page.locator(`:text("${text}")`).all();
        if (elements.length > 0) {
          Utils.log('success', `✅ ${text}`);
          return true;
        }
      }

      // 检查是否在范围外
      const outsideTexts = [
        '不在考勤范围',
        '范围外',
        '外勤'
      ];

      for (const text of outsideTexts) {
        const elements = await this.page.locator(`:text("${text}")`).all();
        if (elements.length > 0) {
          Utils.log('warning', `❌ ${text}`);
          
          // 尝试重新定位
          await this.tryRelocate();
          
          return false;
        }
      }

      Utils.log('warning', '无法确定考勤范围状态，假设在范围内');
      return true;

    } catch (error) {
      Utils.log('error', '检查考勤范围失败:', error.message);
      return false;
    }
  }

  async tryRelocate() {
    Utils.log('info', '🔄 尝试重新定位...');
    
    try {
      const relocateSelectors = [
        'button:has-text("重新定位")',
        '.relocate-btn',
        '[class*="relocate"]',
        ':text("重新定位")'
      ];

      for (const selector of relocateSelectors) {
        const button = this.page.locator(selector).first();
        if (await button.isVisible({ timeout: 2000 })) {
          await button.click();
          Utils.log('info', '已点击重新定位');
          
          // 等待重新定位完成
          await Utils.sleep(5000);
          
          // 重新检查范围
          return await this.checkAttendanceRange();
        }
      }
      
      Utils.log('warning', '未找到重新定位按钮');
      
    } catch (error) {
      Utils.log('error', '重新定位失败:', error.message);
    }
    
    return false;
  }

  async executeClockIn() {
    Utils.log('info', '🔍 查找打卡按钮...');
    
    try {
      // 使用已验证的选择器
      const clockInSelectors = [
        '.attendance-btn-item-box.submit-button',
        '#ours-attendance-check-btn-container',
        '[ours-e-tap="event2check4CheckBtn"]',
        '.attendance-btn-item-box'
      ];

      let clockInButton = null;
      let usedSelector = null;
      
      for (const selector of clockInSelectors) {
        try {
          clockInButton = this.page.locator(selector).first();
          if (await clockInButton.isVisible({ timeout: 2000 })) {
            Utils.log('success', `找到打卡按钮: ${selector}`);
            usedSelector = selector;
            break;
          }
        } catch (e) {
          continue;
        }
      }

      if (!clockInButton) {
        throw new Error('未找到打卡按钮');
      }

      // 获取按钮信息
      const buttonInfo = await this.getButtonInfo(clockInButton);
      Utils.log('info', `📋 打卡按钮信息:`, buttonInfo);

      // 确认打卡操作
      if (this.config.dryRun) {
        Utils.log('info', '🚫 DRY RUN 模式：跳过实际点击');
        return true;
      }

      // 执行打卡
      Utils.log('info', '🎯 执行打卡操作...');
      await clockInButton.click();

      // 等待打卡结果
      await Utils.sleep(3000);

      // 保存打卡结果截图
      await Utils.saveScreenshot(this.page, `clockin-result-${Utils.getCurrentTimestamp()}.png`);

      // 检查打卡结果
      const result = await this.checkClockInResult();
      
      if (result.success) {
        Utils.log('success', `打卡成功！时间: ${result.time || '未知'}`);
        return true;
      } else {
        Utils.log('warning', '打卡结果不确定，请查看截图确认');
        return false;
      }

    } catch (error) {
      throw new Error(`执行打卡失败: ${error.message}`);
    }
  }

  async getButtonInfo(button) {
    try {
      const text = await button.textContent();
      const className = await button.getAttribute('class');
      const boundingBox = await button.boundingBox();
      
      return {
        text: text?.trim(),
        className,
        position: boundingBox ? `x:${boundingBox.x}, y:${boundingBox.y}` : '未知',
        visible: await button.isVisible(),
        enabled: await button.isEnabled()
      };
    } catch (error) {
      return { error: error.message };
    }
  }

  async checkClockInResult() {
    Utils.log('info', '📊 检查打卡结果...');
    
    try {
      // 等待可能的结果提示
      await Utils.sleep(2000);

      // 检查成功提示
      const successTexts = [
        '打卡成功',
        '签到成功', 
        '已打卡',
        '打卡完成'
      ];

      for (const text of successTexts) {
        const elements = await this.page.locator(`:text("${text}")`).all();
        if (elements.length > 0) {
          return { success: true, message: text };
        }
      }

      // 检查错误提示
      const errorTexts = [
        '打卡失败',
        '签到失败',
        '错误',
        '失败'
      ];

      for (const text of errorTexts) {
        const elements = await this.page.locator(`:text("${text}")`).all();
        if (elements.length > 0) {
          return { success: false, message: text };
        }
      }

      // 尝试获取当前打卡时间
      const currentTime = await this.getCurrentClockTime();

      return { 
        success: true, // 没有明显错误，假设成功
        time: currentTime,
        message: '打卡操作完成'
      };

    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  async getCurrentClockTime() {
    try {
      const timeSelectors = [
        '.attendance-section-time',
        '.attendance-btn-time',
        '.time-info',
        '[class*="time"]'
      ];

      for (const selector of timeSelectors) {
        const elements = await this.page.locator(selector).all();
        for (const element of elements) {
          const text = await element.textContent();
          if (text) {
            const timeMatch = text.match(/\d{2}:\d{2}:\d{2}|\d{2}:\d{2}/);
            if (timeMatch) {
              return timeMatch[0];
            }
          }
        }
      }

      return null;
    } catch (error) {
      Utils.log('debug', '获取打卡时间失败:', error.message);
      return null;
    }
  }
}

module.exports = ClockIn;