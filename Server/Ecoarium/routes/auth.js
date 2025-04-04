const express = require('express');
const passport = require('passport');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const db = require('../models');
const nodemailer = require('nodemailer');
const { isLoggedIn, isNotLoggedIn } = require('./middlewares');
const { User } = require('../models');
const { Op } = require("sequelize");
require('dotenv').config();
const router = express.Router();

// 회원가입
router.post('/join', isNotLoggedIn, async (req, res, next) => {
    const { username, password, password_verification, nickname, email } = req.body;
    try {
        const exUser = await User.findOne({ where: { username } });
        if (exUser) {
            req.flash('joinError', '이미 가입된 아이디입니다.');
            res.locals.flashMessage = '이미 가입된 아이디입니다.';
            return res.redirect('/join');
        }
        if (password != password_verification) {
            req.flash('joinError', '비밀번호가 일치하지 않습니다.');
            res.locals.flashMessage = '비밀번호가 일치하지 않습니다.';
            return res.redirect('/join');
        }
        if (!password) {
            req.flash('joinError', '비밀번호를 입력해 주세요.');
            res.locals.flashMessage = '비밀번호를 입력해 주세요.';
            return res.redirect('/join');
        }
        //비밀번호와 api키 암호화
        const hash = await bcrypt.hash(password, 12);
        await User.create({
            username,
            password: hash,
            nickname,
            email,
            points: 0
        });
        return res.redirect('/');
    } catch (error) {
        console.error(error);
        return next(error);
    }
});
// 회원가입(모바일)
router.post('/joinMobile', isNotLoggedIn, async (req, res, next) => {
  const { username, password, password_verification, nickname, email } = req.body;
  try {
      const exUser = await User.findOne({ where: { username } });
      if (exUser) {
          return res.json("이미 가입된 아이디입니다.");
      }
      if (password != password_verification) {
          return res.json("비밀번호가 일치하지 않습니다.");
      }
      if (!password) {
          return res.json("비밀번호를 입력해 주세요.");
      }
      //비밀번호와 api키 암호화
      const hash = await bcrypt.hash(password, 12);
      await User.create({
          username,
          password: hash,
          nickname,
          email,
          points: 0
      });
      return res.json(true);
  } catch (error) {
      console.error(error);
      return next(error);
  }
});

// 로그인
router.post('/login', isNotLoggedIn, (req, res, next) => {
  const username = req.body.username;

  // 세션에서 로그인 시도 정보 가져오기
  if (!req.session.loginAttempts) {
    req.session.loginAttempts = {};
  }

  const attempts = req.session.loginAttempts[username] || { count: 0, lockedUntil: null };

  // 계정이 잠겨 있는지 확인
  if (attempts.lockedUntil && attempts.lockedUntil > Date.now()) {
    req.flash('loginError', '너무 많은 로그인 시도로 인해 계정이 1분 동안 잠겼습니다.');
    return res.redirect('/');
  }

  passport.authenticate('local', (authError, user, info) => {
    if (authError) {
      console.error(authError);
      return next(authError);
    }
    if (!user) {
      // 로그인 실패 시도 증가
      attempts.count += 1;
      req.session.loginAttempts[username] = attempts;

      // 로그인 시도 횟수가 초과되면 계정 잠금
      if (attempts.count >= 5) {
        attempts.lockedUntil = Date.now() + 60 * 1000; // 1분 후 해제
        req.flash('loginError', '로그인 시도가 너무 많아 계정이 1분 동안 잠겼습니다.');
      } else {
        req.flash('loginError', `로그인 실패. ${5 - attempts.count}회 남았습니다.`);
      }
      return res.redirect('/');
    }

    // 로그인 성공 시 실패 횟수 초기화
    req.session.loginAttempts[username] = { count: 0, lockedUntil: null };

    return req.login(user, (loginError) => {
      if (loginError) {
        console.error(loginError);
        return next(loginError);
      }
      return res.redirect('/'); // 성공 시 리다이렉트
    });
  })(req, res, next);
});


// 로그인(어플)
router.post('/loginMobile', isNotLoggedIn, (req, res, next) => {
  passport.authenticate('local', (authError, user, info) => {
      if (authError) {
          console.error(authError);
          return next(authError);
      }
      if (!user) {//실패
          return res.json(info.message);
      }
      return req.login(user, (loginError) => {
          if (loginError) {
              console.error(loginError);
              return next(loginError);
          }//성공
          return res.json(true);
      });
  })(req, res, next); 
});

// 로그아웃
router.get('/logout', isLoggedIn, (req, res, next) => {
  req.logout((err) => {
      if (err) {
          console.error(err);
          return next(err);
      }
      req.session.destroy((err) => {
          if (err) {
              console.error(err);
              return next(err);
          }
          res.redirect('/');
      });
  });
});

//--------------------프로필 수정-----------------------------

// 프로필 불러오기
router.get('/loadProfile', isLoggedIn, async (req,res, next) => {
  try{
      let user = req.user;
      user = user.get({ plain: true });
      delete user.password; delete user.QRcode; delete user.verifCode;
      delete user.createdAt; delete user.updatedAt; delete user.deletedAt;
      res.json({user});
  } catch (error) {
      console.error(error);
      return next(error);
  }
});

// 닉네임 수정
router.put('/modify', isLoggedIn, async (req, res, next) => {
  try {
    await db.User.update({
      nickname: req.body.nickname,
    }, {
      where: {
        id:req.user.id,
      }
    });
    res.redirect('/');
  } catch (error) {
    console.error(error);
    next(error);
  }
});

// 이메일 수정
router.post('/emailModify', isLoggedIn, async (req, res, next) => {
  try {
    await db.User.update({
      email: req.body.email || null,
    }, {
      where: {
        id:req.user.id,
      }
    });
    res.redirect('/profileModification');
  } catch (error) {
    console.error(error);
    next(error);
  }
});


// 비밀번호 변경
router.post('/change-pw', isLoggedIn, async (req, res, next) => {
  const { present_pw, new_pw, new_pw_verification } = req.body;
  try {
    const hash = await bcrypt.hash(new_pw, 12);
    if (new_pw != new_pw_verification) {
      req.flash('joinError', '새 비밀번호와 비밀번호 확인이 일치하지 않습니다.');
      res.locals.flashMessage = '새 비밀번호와 비밀번호 확인이 일치하지 않습니다.';
      return res.redirect('/changepw');
    }
    const result = await bcrypt.compare(present_pw, req.user.password);
    if (!result) {
      req.flash('joinError', '비밀번호가 일치하지 않습니다.');
      res.locals.flashMessage = '비밀번호가 일치하지 않습니다.';
      return res.redirect('/changepw');
    }
    await db.User.update({
      password: hash
    }, {
      where: {
        id: req.user.id
      },
    });
    req.session.destroy((err) => {
      if (err) {
          console.error(err);
          return next(err);
      }
      res.redirect('/');
    });
  } catch (error) {
    console.error(error);
    return next(error);
  }
});

// 비밀번호 변경(모바일)
router.post('/changePwMobile', isLoggedIn, async (req, res, next) => {
  const { present_pw, new_pw, new_pw_verification } = req.body;
  try {
    const hash = await bcrypt.hash(new_pw, 12);
    if (new_pw != new_pw_verification) {
      //새 비밀번호와 비밀번호 확인이 불일치
      return res.json(1);
    }
    const result = await bcrypt.compare(present_pw, req.user.password);
    if (!result) {
      //현재 비밀번호 불일치
      return res.json(2);
    }
    await db.User.update({
      password: hash
    }, {
      where: {
        id: req.user.id
      },
    });
    req.session.destroy((err) => {
      if (err) {
          console.error(err);
          return next(err);
      }
      res.json(3);
    });
  } catch (error) {
    console.error(error);
    return next(error);
  }
});
  
// 계정 삭제
router.post('/withdrawal', isLoggedIn, async (req, res, next) => {
  const { present_pw } = req.body;
  try {
    const result = await bcrypt.compare(present_pw, req.user.password);
    if (!result) {
      req.flash('joinError', '비밀번호가 일치하지 않습니다.');
      res.locals.flashMessage = '비밀번호가 일치하지 않습니다.';
      return res.redirect('/withdrawal');
    }
    await db.User.update({
      username:null,
      password:null,
      nickname:null,
    }, {
      where: {
        id: req.user.id
      },
    });
    await db.User.destroy({ 
      where: {
        Id: req.user.id
      },
    });
    req.session.destroy((err) => {
      if (err) {
          console.error(err);
          return next(err);
      }
      res.redirect('/');
    });
  } catch (error) {
    console.error(error);
    next(error);
  }
});

// 계정 삭제(모바일)
router.post('/withdrawalMobile', isLoggedIn, async (req, res, next) => {
  const { present_pw } = req.body;
  try {
    const result = await bcrypt.compare(present_pw, req.user.password);
    if (!result) {
      //비밀번호 불일치
      return res.json(false);
    }
    await db.User.update({
      username:null,
      password:null,
      nickname:null,
    }, {
      where: {
        id: req.user.id
      },
    });
    await db.User.destroy({ 
      where: {
        Id: req.user.id
      },
    });
    req.session.destroy((err) => {
      if (err) {
          console.error(err);
          return next(err);
      }
      res.json(true);
    });
  } catch (error) {
    console.error(error);
    next(error);
  }
});


// 비밀번호 찾기 ----------------------------------------

// 이메일 전송자
const transporter = nodemailer.createTransport({
  service: 'gmail',
  host: 'smtp.gmail.com', // 사용할 이메일 서비스의 호스트 주소 (gamil)
  port: 587, // 이메일 서비스의 포트 번호 (일반적으로 25, 587, 465, 2525 중 하나 사용)
  auth: {
    user: process.env.EMAIL_USER, // 나의 (작성자) 이메일 주소
    pass: process.env.EMAIL_PASS // 이메일의 비밀번호
  }
});

// 아이디 입력
router.post('/sendCode', isNotLoggedIn, async (req, res, next) => {
  const { username } = req.body;
  try {
    // 유저
    const user = await User.findOne({ where: { username } });
    if (!user) return res.redirect('/');
    // 인증 코드 생성
    const verifCode = crypto.randomBytes(8).toString('hex');
    // 저장 값 = 코드 + 시간
    let now = new Date();
    let timestamp = now.getTime();
    const value = verifCode + timestamp;
    await db.User.update({
      verifCode: value,
      }, {
          where: {
              Id: user.id,
          }
    });
    // 이메일 전송
    // 이메일 정보
    const mailOptions = {
      from: process.env.EMAIL_USER, // 작성자
      to: user.email, // 수신자
      subject: 'Ecoarium verification code', // 메일 제목
      text: verifCode // 메일 내용
    };
    // 전송
    transporter.sendMail(mailOptions, function(error, info){
      if (error) {
        console.log(error);
      } else {
        console.log('Email sent: ' + info.response);
      }
    });

    res.redirect('/');
  } catch (error) {
    console.error(error);
    next(error);
  }
});

// 비밀번호 재설정
router.post('/newPW', isNotLoggedIn, async (req, res, next) => {
  let { username, code, newPw, newPwVerif } = req.body;

  try {
    // 입력 유효성 검사
    if (typeof username !== 'string') {
      return res.status(400).json("잘못된 사용자 이름 형식입니다.");
    }

    // 비밀번호 확인 체크
    if (newPw !== newPwVerif) {
      return res.json("새 비밀번호와 비밀번호 확인이 일치하지 않습니다.");
    }

    // 사용자 조회 (Op.eq로 고정)
    const user = await User.findOne({
      where: {
        username: { [Op.eq]: username }
      }
    });

    // 인증 코드 체크
    if (!user || code !== user.verifCode.substring(0, 16)) {
      return res.json("인증 코드가 일치하지 않습니다.");
    }

    // 유효 시간 체크
    const time = user.verifCode.substring(16);
    const nowTime = new Date().getTime();
    const timeDifference = nowTime - time;
    if (timeDifference >= 60000) {
      return res.json("인증 코드의 유효시간이 만료되었습니다.");
    }

    // 비밀번호 해시 후 저장
    const hash = await bcrypt.hash(newPw, 12);
    await db.User.update({
      password: hash,
      verifCode: null
    }, {
      where: { id: user.id }
    });

    res.json(true);
  } catch (error) {
    console.error(error);
    next(error);
  }
});

module.exports = router;
  