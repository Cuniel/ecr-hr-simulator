const Utils = require('./utils');
const SlideVerify = require('./slideVerify');

class Login {
  constructor(page) {
    this.page = page;
    this.config = Utils.loadConfig();
    this.slideVerify = new SlideVerify(page);
  }

  async perform() {
    Utils.log('info', '🔑 开始登录流程...');
    
    try {
      // 访问登录页面
      await this.accessLoginPage();
      
      // 填写登录信息
      await this.fillCredentials();
      
      // 处理滑动验证
      await this.handleVerification();
      
      // 提交登录
      const success = await this.submitLogin();
      
      if (success) {
        Utils.log('success', '🎉 登录成功！');
        return true;
      } else {
        Utils.log('error', '登录失败');
        return false;
      }
      
    } catch (error) {
      Utils.log('error', '登录过程异常:', error.message);
      
      // 保存错误截图
      await Utils.saveScreenshot(this.page, `login-error-${Utils.getCurrentTimestamp()}.png`);
      
      return false;
    }
  }

  async accessLoginPage() {
    Utils.log('info', '🌐 访问登录页面...');
    
    await this.page.goto('https://ecr-hr.ecloudrover.com/login.do');
    await this.page.waitForLoadState('domcontentloaded');
    
    // 保存登录页面截图
    await Utils.saveScreenshot(this.page, `login-page-${Utils.getCurrentTimestamp()}.png`);
    
    Utils.log('success', '登录页面加载完成');
  }

  async fillCredentials() {
    Utils.log('info', '📝 填写登录信息...');
    
    try {
      // 填写用户名
      const usernameSelector = '#cellphone';
      await this.page.fill(usernameSelector, this.config.username);
      Utils.log('success', '用户名填写完成');
      
      // 填写密码
      const passwordSelector = '#password';
      await this.page.fill(passwordSelector, this.config.password);
      Utils.log('success', '密码填写完成');
      
      // 等待页面响应
      await Utils.sleep(1000);
      
    } catch (error) {
      throw new Error(`填写登录信息失败: ${error.message}`);
    }
  }

  async handleVerification() {
    Utils.log('info', '🔐 处理验证码...');
    
    // 等待滑动验证出现
    await Utils.sleep(2000);
    
    const verifySuccess = await this.slideVerify.handle();
    
    if (!verifySuccess) {
      throw new Error('滑动验证失败');
    }
  }

  async submitLogin() {
    Utils.log('info', '🚀 提交登录请求...');
    
    try {
      // 点击登录按钮
      const loginButton = this.page.locator('button:has-text("登录")').first();
      
      if (!await loginButton.isVisible()) {
        throw new Error('未找到登录按钮');
      }
      
      await loginButton.click();
      Utils.log('info', '登录按钮已点击');
      
      // 等待登录结果
      try {
        await this.page.waitForURL('**/home.do**', { timeout: 15000 });
        
        // 保存成功登录后的截图
        await Utils.saveScreenshot(this.page, `login-success-${Utils.getCurrentTimestamp()}.png`);
        
        return true;
        
      } catch (timeoutError) {
        Utils.log('warning', '等待页面跳转超时，检查登录状态...');
        
        // 检查当前URL
        const currentUrl = this.page.url();
        Utils.log('debug', `当前URL: ${currentUrl}`);
        
        // 如果URL包含home或portal，认为登录成功
        if (currentUrl.includes('home') || currentUrl.includes('portal')) {
          Utils.log('success', '检测到已在首页，登录成功');
          return true;
        }
        
        // 检查是否有错误提示
        await this.checkLoginErrors();
        
        return false;
      }
      
    } catch (error) {
      throw new Error(`提交登录失败: ${error.message}`);
    }
  }

  async checkLoginErrors() {
    try {
      const errorSelectors = [
        '.error',
        '.错误', 
        '[class*="error"]',
        '.login-error',
        '.alert'
      ];

      for (const selector of errorSelectors) {
        const errorElements = await this.page.locator(selector).all();
        for (const element of errorElements) {
          const text = await element.textContent();
          if (text && text.trim()) {
            Utils.log('error', `登录错误信息: ${text.trim()}`);
          }
        }
      }
      
      // 保存错误状态截图
      await Utils.saveScreenshot(this.page, `login-timeout-${Utils.getCurrentTimestamp()}.png`);
      
    } catch (error) {
      Utils.log('debug', '检查登录错误失败:', error.message);
    }
  }
}

module.exports = Login;