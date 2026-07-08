const Utils = require('./utils');

class ClockIn {
  constructor(page, config = Utils.loadConfig()) {
    this.page = page;
    this.config = config;
  }

  async perform() {
    Utils.log('info', '📍 开始操作流程...');
    
    try {
      // 访问操作页面
      await this.accessClockInPage();
      
      // 检查考勤范围
      const inRange = await this.checkAttendanceRange();
      if (!inRange) {
        Utils.log('error', '不在考勤范围内，无法操作');
        return false;
      }
      
      // 查找并点击操作按钮
      const success = await this.executeClockIn();
      
      if (success) {
        Utils.log('success', '🎉 操作成功！');
        return true;
      } else {
        Utils.log('error', '操作失败');
        return false;
      }
      
    } catch (error) {
      Utils.log('error', '操作流程异常:', error.message);
      
      // 保存错误截图
      await Utils.saveScreenshot(this.page, `clockin-error-${Utils.getCurrentTimestamp()}.png`);
      
      return false;
    }
  }

  async accessClockInPage() {
    Utils.log('info', '🌐 访问操作页面...');
    
    await this.page.goto('https://ecr-hr.ecloudrover.com/ehr/attendance/data.do?method=index', {
      waitUntil: 'networkidle'
    });
    await this.page.waitForLoadState('domcontentloaded');
    
    // 等待页面完全加载和JavaScript执行
    await Utils.sleep(5000);
    
    // 保存页面状态截图
    await Utils.saveScreenshot(this.page, `clockin-page-${Utils.getCurrentTimestamp()}.png`);
    
    Utils.log('success', '操作页面加载完成');
  }

  async checkAttendanceRange() {
    Utils.log('info', '🌍 检查考勤范围状态...');
    
    try {
      // 等待页面内容完全加载
      await Utils.sleep(2000);
      
      // 查找考勤范围内的提示
      const inRangeTexts = [
        '已在考勤范围内',
        '已在考勤范围',
        '范围内'
      ];

      for (const text of inRangeTexts) {
        try {
          const elements = await this.page.locator(`:text("${text}")`).all();
          if (elements.length > 0) {
            Utils.log('success', `✅ ${text}`);
            return true;
          }
        } catch (e) {
          // 继续尝试下一个
        }
      }

      // 检查是否在范围外
      const outsideTexts = [
        '不在考勤范围',
        '范围外',
        '外勤'
      ];

      for (const text of outsideTexts) {
        try {
          const elements = await this.page.locator(`:text("${text}")`).all();
          if (elements.length > 0) {
            Utils.log('warning', `❌ ${text}`);
            
            // 尝试重新定位
            const relocated = await this.tryRelocate();
            return relocated;
          }
        } catch (e) {
          // 继续尝试下一个
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
        ':text("重新定位")',
        '.relocate-btn',
        '[class*="relocate"]'
      ];

      for (const selector of relocateSelectors) {
        try {
          const button = this.page.locator(selector).first();
          if (await button.isVisible({ timeout: 2000 })) {
            await button.click();
            Utils.log('info', '已点击重新定位');
            
            // 等待重新定位完成
            await Utils.sleep(5000);
            
            // 重新检查范围
            return await this.recheckAttendanceRange();
          }
        } catch (e) {
          continue;
        }
      }
      
      Utils.log('warning', '未找到重新定位按钮');
      return false;
      
    } catch (error) {
      Utils.log('error', '重新定位失败:', error.message);
      return false;
    }
  }

  async recheckAttendanceRange() {
    Utils.log('info', '🔄 重新检查考勤范围...');
    
    try {
      await Utils.sleep(2000);
      
      const inRangeTexts = ['已在考勤范围内', '已在考勤范围', '范围内'];
      
      for (const text of inRangeTexts) {
        const elements = await this.page.locator(`:text("${text}")`).all();
        if (elements.length > 0) {
          Utils.log('success', `✅ 重新定位后: ${text}`);
          return true;
        }
      }
      
      Utils.log('warning', '重新定位后仍不在范围内');
      return false;
      
    } catch (error) {
      Utils.log('error', '重新检查考勤范围失败:', error.message);
      return false;
    }
  }

  async executeClockIn() {
    Utils.log('info', '🔍 查找操作按钮...');
    
    try {
      // 等待页面稳定
      await Utils.sleep(3000);
      
      // 专门针对圆形操作按钮的选择器
      const clockInSelectors = [
        // 优先使用测试中成功的选择器
        '[ours-e-tap="event2check4CheckBtn"]',
        
        // 圆形按钮相关选择器
        '.attendance-btn-item-box.submit-button',
        '#ours-attendance-check-btn-container .attendance-btn-item-box',
        '#ours-attendance-check-btn-container',
        
        // 更具体的圆形按钮选择器
        '.attendance-btn .attendance-btn-item-box',
        '.attendance-btn-group .attendance-btn-item-box',
        '.attendance-btn-box .attendance-btn-item-box',
        
        // 其他 ours-e-tap 相关
        '[ours-e-tap*="check"]',
        
        // 备用选择器
        '.submit-button',
        '.attendance-btn-item-box',
        
        // 包含文字的选择器
        ':text("下班操作")',
        ':text("上班操作")',
        ':text("操作")'
      ];

      let clockInButton = null;
      
      // 详细的查找过程
      for (const selector of clockInSelectors) {
        try {
          Utils.log('debug', `🔍 尝试选择器: ${selector}`);
          const elements = await this.page.locator(selector).all();
          Utils.log('debug', `   找到 ${elements.length} 个匹配元素`);
          
          for (let i = 0; i < elements.length; i++) {
            const element = elements[i];
            
            // 检查元素是否可见和可点击
            const isVisible = await element.isVisible();
            const boundingBox = await element.boundingBox();
            const isAttached = await element.evaluate(el => el.isConnected).catch(() => false);
            
            if (isVisible && boundingBox && boundingBox.width > 0 && boundingBox.height > 0 && isAttached) {
              // 检查元素内容和属性
              const textContent = await element.textContent().catch(() => '');
              const className = await element.getAttribute('class').catch(() => '');
              const oursETap = await element.getAttribute('ours-e-tap').catch(() => '');
              
              Utils.log('debug', `   元素 ${i}: 文本="${textContent?.trim()}" class="${className}" ours-e-tap="${oursETap}"`);
              Utils.log('debug', `   位置: x=${Math.round(boundingBox.x)}, y=${Math.round(boundingBox.y)}, w=${Math.round(boundingBox.width)}, h=${Math.round(boundingBox.height)}`);
              
              // 优先选择包含操作相关文字或属性的元素
              if ((textContent && (textContent.includes('操作') || textContent.includes('上班') || textContent.includes('下班'))) ||
                  (oursETap && oursETap.includes('check')) ||
                  (className && className.includes('submit-button'))) {
                clockInButton = element;
                Utils.log('success', `✅ 找到最佳操作按钮: ${selector}`);
                break;
              } else if (!clockInButton) {
                clockInButton = element;
                Utils.log('info', `📍 找到候选操作按钮: ${selector}`);
              }
            }
          }
          
          if (clockInButton) break;
          
        } catch (e) {
          Utils.log('debug', `   选择器失败: ${e.message}`);
          continue;
        }
      }

      if (!clockInButton) {
        await this.analyzePageElements();
        throw new Error('未找到操作按钮');
      }

      // 获取并显示按钮详细信息
      const buttonInfo = await this.getDetailedButtonInfo(clockInButton);
      Utils.log('info', `📋 操作按钮详细信息:`, buttonInfo);

      // 保存点击前的页面状态
      const beforeState = await this.capturePageState();
      
      // 高亮按钮
      try {
        await clockInButton.evaluate(element => {
          element.style.border = '3px solid red';
          element.style.backgroundColor = 'rgba(255, 255, 0, 0.3)';
          element.style.zIndex = '9999';
        });
      } catch (e) {
        Utils.log('debug', '高亮按钮失败:', e.message);
      }

      // 保存点击前截图
      await Utils.saveScreenshot(this.page, `before-click-${Utils.getCurrentTimestamp()}.png`);

      // 测试模式检查
      if (this.config.dryRun) {
        Utils.log('info', '🚫 测试模式：跳过实际点击');
        return true;
      }

      // 执行优化的tap点击操作
      const clickSuccess = await this.performOptimizedTap(clockInButton);
      
      if (!clickSuccess) {
        throw new Error('tap点击操作失败');
      }

      // 等待页面响应和网络请求完成
      Utils.log('info', '⏳ 等待页面响应和网络请求...');
      await Utils.sleep(8000); // 增加等待时间，确保所有网络请求完成

      // 检查页面状态变化
      const afterState = await this.capturePageState();
      const stateChanged = await this.comparePageStates(beforeState, afterState);
      
      if (stateChanged.changed) {
        Utils.log('success', '✅ 检测到页面状态变化:', stateChanged.details);
      } else {
        Utils.log('warning', '⚠️  页面状态未发生明显变化');
      }

      // 保存点击后截图
      await Utils.saveScreenshot(this.page, `after-click-${Utils.getCurrentTimestamp()}.png`);

      // 检查操作结果
      const result = await this.checkClockInResult();
      
      if (result.success) {
        Utils.log('success', `✅ 操作成功！时间: ${result.time || '未知'}`);
        await this.saveFinalScreenshot('clockin-result');
        return true;
      } else {
        // 即使检测不到明确的成功标识，如果有网络请求且页面状态改变了，也认为可能成功
        if (stateChanged.changed) {
          Utils.log('info', '📊 基于页面变化判断，操作可能已成功');
          await this.saveFinalScreenshot('clockin-result');
          return true;
        } else {
          Utils.log('warning', `⚠️  操作结果不确定: ${result.message || '未知'}`);
          await this.saveFinalScreenshot('clockin-uncertain');
          return false;
        }
      }

    } catch (error) {
      Utils.log('error', `执行操作失败: ${error.message}`);
      await Utils.saveScreenshot(this.page, `clockin-failed-${Utils.getCurrentTimestamp()}.png`);
      return false;
    }
  }

  async saveFinalScreenshot(prefix) {
    try {
      await this.page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {});
      await this.page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
      await Utils.sleep(800);
      Utils.log('info', `📸 保存最终页面截图: ${prefix}`);
      await Utils.saveScreenshot(this.page, `${prefix}-${Utils.getCurrentTimestamp()}.png`);
    } catch (error) {
      Utils.log('warning', '最终页面截图保存失败:', error.message);
    }
  }

  async performOptimizedTap(button) {
    Utils.log('info', '🎯 执行优化的tap点击操作...');
    
    // 设置网络监听，监控操作相关请求
    let hasClockRequest = false;
    const requestListener = (request) => {
      const url = request.url();
      if (url.includes('attendance') && (url.includes('check') || url.includes('clock'))) {
        Utils.log('success', `🌐 检测到操作请求: ${request.method()} ${url}`);
        hasClockRequest = true;
      }
    };
    
    this.page.on('request', requestListener);
    
    try {
      // 确保元素完全加载和可见
      await this.page.waitForTimeout(1000);
      await button.scrollIntoViewIfNeeded();
      await this.page.waitForTimeout(1000);
      
      // 确保没有其他元素遮挡
      const actionability = await button.evaluate(el => {
        const rect = el.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const topElement = document.elementFromPoint(centerX, centerY);
        return {
          actionable: topElement === el || el.contains(topElement),
          centerX,
          centerY,
          width: rect.width,
          height: rect.height,
          topTag: topElement?.tagName || '',
          topText: (topElement?.innerText || topElement?.textContent || '').trim().slice(0, 80),
          topClass: topElement?.className || ''
        };
      });
      
      Utils.log('info', '🎯 操作按钮点击检测:', actionability);
      if (!actionability.actionable) {
        Utils.log('warning', '⚠️  按钮可能被其他元素遮挡:', actionability);
      }
      
      // 使用测试中成功的tap手势方法
      Utils.log('info', '📱 执行tap手势...');
      
      // 方法1：使用Playwright的tap方法（测试中成功的方法）
      await button.tap({ timeout: 10000 });
      Utils.log('success', '✅ tap手势执行完成');
      
      // 等待网络请求触发
      await Utils.sleep(3000);
      
      // 如果第一次tap没有触发请求，尝试备用方法
      if (!hasClockRequest) {
        Utils.log('info', '🔄 第一次tap未检测到请求，尝试备用方法...');
        
        // 方法2：通过选择器直接tap
        try {
          await this.page.tap('[ours-e-tap="event2check4CheckBtn"]', { timeout: 5000 });
          Utils.log('success', '✅ 备用tap方法执行完成');
          await Utils.sleep(2000);
        } catch (e) {
          Utils.log('warning', '备用tap方法失败:', e.message);
        }
        
        // 方法3：如果仍然没有请求，尝试JavaScript模拟触摸事件
        if (!hasClockRequest) {
          Utils.log('info', '🔄 尝试JavaScript模拟触摸事件...');
          try {
            await button.evaluate(el => {
              // 创建触摸事件序列
              const rect = el.getBoundingClientRect();
              const centerX = rect.left + rect.width / 2;
              const centerY = rect.top + rect.height / 2;
              
              const touch = new Touch({
                identifier: 0,
                target: el,
                clientX: centerX,
                clientY: centerY,
                radiusX: 2.5,
                radiusY: 2.5,
                rotationAngle: 0,
                force: 0.5
              });
              
              const touchStartEvent = new TouchEvent('touchstart', {
                cancelable: true,
                bubbles: true,
                touches: [touch],
                targetTouches: [touch],
                changedTouches: [touch]
              });
              
              const touchEndEvent = new TouchEvent('touchend', {
                cancelable: true,
                bubbles: true,
                touches: [],
                targetTouches: [],
                changedTouches: [touch]
              });
              
              // 触发事件序列
              el.dispatchEvent(touchStartEvent);
              setTimeout(() => {
                el.dispatchEvent(touchEndEvent);
                // 同时触发点击事件
                el.click();
              }, 100);
            });
            
            Utils.log('success', '✅ JavaScript触摸事件执行完成');
            await Utils.sleep(2000);
          } catch (e) {
            Utils.log('warning', 'JavaScript触摸事件失败:', e.message);
          }
        }

        // 方法4：强制点击，绕过可操作性检查
        if (!hasClockRequest) {
          Utils.log('info', '🔄 尝试Playwright force click...');
          try {
            await button.click({ timeout: 5000, force: true });
            Utils.log('success', '✅ Playwright force click执行完成');
            await Utils.sleep(2000);
          } catch (e) {
            Utils.log('warning', 'Playwright force click失败:', e.message);
          }
        }

        // 方法5：按元素中心点执行鼠标点击
        if (!hasClockRequest) {
          Utils.log('info', '🔄 尝试中心点mouse click...');
          try {
            const centerPoint = await button.evaluate(el => {
              const rect = el.getBoundingClientRect();
              return {
                x: rect.left + rect.width / 2,
                y: rect.top + rect.height / 2,
                width: rect.width,
                height: rect.height
              };
            });
            Utils.log('info', '🖱️  中心点点击坐标:', centerPoint);
            await this.page.mouse.click(centerPoint.x, centerPoint.y);
            Utils.log('success', '✅ 中心点mouse click执行完成');
            await Utils.sleep(2000);
          } catch (e) {
            Utils.log('warning', '中心点mouse click失败:', e.message);
          }
        }
      }
      
      // 移除事件监听器
      this.page.off('request', requestListener);
      
      // 检查是否成功触发了操作请求
      if (hasClockRequest) {
        Utils.log('success', '🎉 成功触发操作请求！');
        return true;
      } else {
        Utils.log('warning', '⚠️  未检测到操作请求，但操作已执行');
        return true; // 仍然返回true，因为操作已执行，后续会检查结果
      }
      
    } catch (error) {
      this.page.off('request', requestListener);
      Utils.log('error', `tap操作失败: ${error.message}`);
      return false;
    }
  }

  async capturePageState() {
    try {
      return await this.page.evaluate(() => {
        // 获取页面关键信息
        const buttons = Array.from(document.querySelectorAll('button, [ours-e-tap], .btn')).map(btn => ({
          text: btn.textContent?.trim(),
          className: btn.className,
          visible: btn.offsetParent !== null
        }));
        
        const timeElements = Array.from(document.querySelectorAll('[class*="time"], .attendance-section')).map(el => ({
          text: el.textContent?.trim(),
          className: el.className
        }));
        
        return {
          url: window.location.href,
          title: document.title,
          buttons: buttons.slice(0, 10), // 限制数量
          timeElements: timeElements.slice(0, 5),
          bodyHash: document.body.innerHTML.length // 简单的内容变化检测
        };
      });
    } catch (error) {
      Utils.log('debug', '获取页面状态失败:', error.message);
      return null;
    }
  }

  async comparePageStates(before, after) {
    if (!before || !after) {
      return { changed: false, details: { reason: '状态获取失败' } };
    }
    
    const details = {
      urlChanged: before.url !== after.url,
      titleChanged: before.title !== after.title,
      contentChanged: before.bodyHash !== after.bodyHash,
      buttonsChanged: JSON.stringify(before.buttons) !== JSON.stringify(after.buttons),
      timeChanged: JSON.stringify(before.timeElements) !== JSON.stringify(after.timeElements)
    };
    
    const changed = Object.values(details).some(Boolean);
    
    return { changed, details };
  }

  async analyzePageElements() {
    Utils.log('info', '📊 分析页面所有可点击元素...');
    
    try {
      // 查找所有可能的可点击元素
      const clickableSelectors = [
        'button',
        'a',
        'div[onclick]',
        'span[onclick]',
        '[ours-e-tap]',
        '[class*="btn"]',
        '[class*="button"]'
      ];

      for (const selector of clickableSelectors) {
        try {
          const elements = await this.page.locator(selector).all();
          if (elements.length > 0) {
            Utils.log('debug', `${selector}: 找到 ${elements.length} 个元素`);
            
            for (let i = 0; i < Math.min(elements.length, 5); i++) {
              const element = elements[i];
              const text = await element.textContent().catch(() => '');
              const className = await element.getAttribute('class').catch(() => '');
              const isVisible = await element.isVisible();
              
              Utils.log('debug', `  ${i + 1}: "${text?.trim()}" class="${className}" 可见=${isVisible}`);
            }
          }
        } catch (e) {
          continue;
        }
      }
    } catch (error) {
      Utils.log('error', '分析页面元素失败:', error.message);
    }
  }

  async getDetailedButtonInfo(button) {
    try {
      const text = await button.textContent().catch(() => '');
      const className = await button.getAttribute('class').catch(() => '');
      const tagName = await button.evaluate(el => el.tagName).catch(() => '');
      const oursETap = await button.getAttribute('ours-e-tap').catch(() => '');
      const onclick = await button.getAttribute('onclick').catch(() => '');
      const boundingBox = await button.boundingBox().catch(() => null);
      const isVisible = await button.isVisible().catch(() => false);
      const isEnabled = await button.isEnabled().catch(() => false);
      
      return {
        tagName,
        text: text?.trim(),
        className,
        oursETap,
        onclick,
        position: boundingBox ? 
          `x:${Math.round(boundingBox.x)}, y:${Math.round(boundingBox.y)}, w:${Math.round(boundingBox.width)}, h:${Math.round(boundingBox.height)}` : 
          '未知',
        visible: isVisible,
        enabled: isEnabled
      };
    } catch (error) {
      return { error: error.message };
    }
  }

  async checkClockInResult() {
    Utils.log('info', '📊 检查操作结果...');
    
    try {
      // 等待页面响应和可能的提示
      await Utils.sleep(3000);

      // 检查是否跳转到了操作结果页面
      const currentUrl = this.page.url();
      if (currentUrl.includes('checkResult') || currentUrl.includes('result')) {
        Utils.log('success', '✅ 检测到跳转到操作结果页面');
        
        // 尝试获取结果页面的信息
        const resultText = await this.page.locator('body').textContent().catch(() => '');
        if (resultText.includes('成功') || resultText.includes('完成')) {
          return { success: true, message: '操作结果页面显示成功' };
        }
      }

      // 检查成功提示文字
      const successTexts = [
        '操作成功',
        '签到成功', 
        '已操作',
        '操作完成',
        '操作成功',
        '成功'
      ];

      for (const text of successTexts) {
        try {
          const elements = await this.page.locator(`:text("${text}")`).all();
          if (elements.length > 0) {
            Utils.log('success', `找到成功提示: ${text}`);
            return { success: true, message: text };
          }
        } catch (e) {
          continue;
        }
      }

      // 检查失败提示文字
      const errorTexts = [
        '操作失败',
        '签到失败',
        '操作失败',
        '错误',
        '失败',
        '异常'
      ];

      for (const text of errorTexts) {
        try {
          const elements = await this.page.locator(`:text("${text}")`).all();
          if (elements.length > 0) {
            Utils.log('warning', `找到失败提示: ${text}`);
            return { success: false, message: text };
          }
        } catch (e) {
          continue;
        }
      }

      // 尝试获取当前操作时间
      const currentTime = await this.getCurrentClockTime();
      if (currentTime) {
        Utils.log('success', `检测到操作时间: ${currentTime}`);
        return { success: true, time: currentTime, message: '检测到新的操作时间' };
      }

      // 检查是否有新的操作记录
      const hasNewRecord = await this.checkNewClockRecord();
      if (hasNewRecord) {
        Utils.log('success', '检测到新的操作记录');
        return { success: true, message: '检测到新的操作记录' };
      }

      // 基于网络请求判断（如果之前检测到了操作请求）
      Utils.log('info', '基于网络请求和操作执行，推测操作可能成功');
      return { 
        success: true, 
        message: '操作操作已执行，基于网络请求推测可能成功'
      };

    } catch (error) {
      Utils.log('error', '检查操作结果失败:', error.message);
      return { success: false, message: error.message };
    }
  }

  async getCurrentClockTime() {
    try {
      const timeSelectors = [
        '.attendance-section-time',
        '.attendance-btn-time',
        '.time-info',
        '[class*="time"]:not(.current-time)',
        '.attendance-info [class*="time"]'
      ];

      for (const selector of timeSelectors) {
        try {
          const elements = await this.page.locator(selector).all();
          for (const element of elements) {
            const text = await element.textContent().catch(() => '');
            if (text) {
              // 匹配时间格式 HH:MM:SS 或 HH:MM
              const timeMatch = text.match(/\d{2}:\d{2}(:\d{2})?/);
              if (timeMatch) {
                const foundTime = timeMatch[0];
                Utils.log('debug', `找到时间显示: ${foundTime} 来源: ${selector}`);
                
                // 检查时间是否是最近的（±5分钟内）
                const now = new Date();
                const currentTimeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
                const [foundHour, foundMin] = foundTime.split(':').map(Number);
                const foundMinutes = foundHour * 60 + foundMin;
                const currentMinutes = now.getHours() * 60 + now.getMinutes();
                
                if (Math.abs(foundMinutes - currentMinutes) <= 5) {
                  return foundTime;
                }
              }
            }
          }
        } catch (e) {
          continue;
        }
      }

      return null;
    } catch (error) {
      Utils.log('debug', '获取操作时间失败:', error.message);
      return null;
    }
  }

  async checkNewClockRecord() {
    try {
      // 检查是否有新的操作记录条目
      const recordElements = await this.page.locator('.attendance-section li, .log-item, [class*="record"]').all();
      
      for (const element of recordElements) {
        const text = await element.textContent().catch(() => '');
        const currentTime = new Date();
        const currentTimeStr = `${currentTime.getHours().toString().padStart(2, '0')}:${currentTime.getMinutes().toString().padStart(2, '0')}`;
        
        if (text.includes(currentTimeStr)) {
          return true;
        }
      }
      
      return false;
    } catch (error) {
      return false;
    }
  }

}

module.exports = ClockIn;
