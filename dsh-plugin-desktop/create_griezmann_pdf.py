#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
生成「破地方」主题 — 赞美格列兹曼 PDF 文档
"""

import os
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm, cm
from reportlab.lib.colors import HexColor, white, black, Color
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT, TA_JUSTIFY
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle,
    KeepTogether, HRFlowable
)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.cidfonts import UnicodeCIDFont

# ---------------------------------------------------------------------------
# 尝试注册中文字体
# ---------------------------------------------------------------------------
CHINESE_FONT = "Helvetica"
for font_name, font_path in [
    ("SimSun", "C:/Windows/Fonts/simsun.ttc"),
    ("SimHei", "C:/Windows/Fonts/simhei.ttf"),
    ("MicrosoftYaHei", "C:/Windows/Fonts/msyh.ttc"),
    ("MicrosoftYaHeiUI", "C:/Windows/Fonts/msyh.ttc"),
]:
    if os.path.exists(font_path):
        try:
            pdfmetrics.registerFont(TTFont(font_name, font_path))
            CHINESE_FONT = font_name
            break
        except Exception:
            continue

# 如果都没有，用内置 CID 字体
if CHINESE_FONT == "Helvetica":
    try:
        pdfmetrics.registerFont(UnicodeCIDFont('STSong-Light'))
        CHINESE_FONT = 'STSong-Light'
    except Exception:
        pass

# ---------------------------------------------------------------------------
# 颜色主题
# ---------------------------------------------------------------------------
C_PRIMARY   = HexColor("#1a237e")   # 深蓝
C_ACCENT    = HexColor("#c62828")   # 法国红
C_GOLD      = HexColor("#f9a825")   # 金色
C_LIGHT_BG  = HexColor("#e8eaf6")   # 浅蓝灰
C_DARK      = HexColor("#212121")
C_GREY      = HexColor("#666666")
C_WHITE     = white
C_FRANCE_BLUE = HexColor("#002395")
C_FRANCE_RED  = HexColor("#ED2939")

# ---------------------------------------------------------------------------
# 样式
# ---------------------------------------------------------------------------
styles = getSampleStyleSheet()

def make_style(name, parent='Normal', **kw):
    base = styles[parent]
    return ParagraphStyle(name, parent=base, fontName=CHINESE_FONT, **kw)

s_cover_title = make_style('CoverTitle', fontSize=36, leading=44, alignment=TA_CENTER,
                           textColor=C_GOLD, spaceAfter=6)
s_cover_sub   = make_style('CoverSub', fontSize=18, leading=24, alignment=TA_CENTER,
                           textColor=C_WHITE, spaceAfter=4)
s_cover_info  = make_style('CoverInfo', fontSize=12, leading=16, alignment=TA_CENTER,
                           textColor=HexColor("#bbdefb"), spaceAfter=2)
s_h1 = make_style('H1', fontSize=22, leading=30, textColor=C_PRIMARY, spaceBefore=20, spaceAfter=12)
s_h2 = make_style('H2', fontSize=16, leading=22, textColor=C_ACCENT, spaceBefore=14, spaceAfter=8)
s_body = make_style('Body', fontSize=11, leading=18, textColor=C_DARK, spaceAfter=6,
                    alignment=TA_JUSTIFY, firstLineIndent=22)
s_quote = make_style('Quote', fontSize=12, leading=18, textColor=C_GREY,
                     leftIndent=30, rightIndent=30, spaceAfter=10,
                     alignment=TA_CENTER, fontStyle='italic')
s_bullet = make_style('Bullet', fontSize=11, leading=18, textColor=C_DARK,
                      leftIndent=25, bulletIndent=10, spaceAfter=4)
s_stat_num = make_style('StatNum', fontSize=28, leading=34, textColor=C_ACCENT, alignment=TA_CENTER)
s_stat_label = make_style('StatLabel', fontSize=10, leading=14, textColor=C_GREY, alignment=TA_CENTER)
s_footer = make_style('Footer', fontSize=8, leading=10, textColor=C_GREY, alignment=TA_CENTER)

# ---------------------------------------------------------------------------
# 辅助函数
# ---------------------------------------------------------------------------
def h1(text):
    return Paragraph(text, s_h1)

def h2(text):
    return Paragraph(text, s_h2)

def body(text):
    return Paragraph(text, s_body)

def spacer(h=6):
    return Spacer(1, h)

def quote(text):
    return Paragraph(f"「{text}」", s_quote)

def stat_box(num, label):
    """统计数据小卡片"""
    t = Table([
        [Paragraph(str(num), s_stat_num)],
        [Paragraph(label, s_stat_label)],
    ], colWidths=[80])
    t.setStyle(TableStyle([
        ('ALIGN', (0,0), (-1,-1), 'CENTER'),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('BOX', (0,0), (-1,-1), 0.5, C_GREY),
        ('BACKGROUND', (0,0), (-1,-1), C_LIGHT_BG),
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
    ]))
    return t

def hr():
    return HRFlowable(width="100%", thickness=1, color=C_PRIMARY, spaceBefore=6, spaceAfter=6)

def bullet(text):
    return Paragraph(f"<bullet>&bull;</bullet> {text}", s_bullet)

# ---------------------------------------------------------------------------
# 文档构建
# ---------------------------------------------------------------------------
output_path = os.path.expanduser("~/111/破地方_赞美格列兹曼.pdf")
output_path = os.path.abspath(output_path)

doc = SimpleDocTemplate(
    output_path,
    pagesize=A4,
    topMargin=20*mm, bottomMargin=20*mm,
    leftMargin=22*mm, rightMargin=22*mm,
    title="破地方 · 赞美格列兹曼",
    author="破地方球迷社区",
)

story = []

# =========================== 封面 ===========================
story.append(Spacer(1, 80))
story.append(HRFlowable(width="40%", thickness=2, color=C_GOLD, spaceBefore=0, spaceAfter=10))
story.append(Paragraph("破 地 方", s_cover_title))
story.append(Paragraph("<font color='#ffffff'>Podi</font>", make_style('Podi', fontSize=14, leading=18, alignment=TA_CENTER, textColor=HexColor("#bbdefb"))))
story.append(spacer(20))
story.append(Paragraph("赞 美 格 列 兹 曼", make_style('BigTitle', fontSize=32, leading=40, alignment=TA_CENTER, textColor=C_WHITE, spaceAfter=6)))
story.append(Paragraph("Antoine Griezmann · 永远的格子", s_cover_sub))
story.append(spacer(10))
story.append(HRFlowable(width="60%", thickness=1, color=C_GOLD, spaceBefore=0, spaceAfter=10))
story.append(spacer(30))
story.append(Paragraph("献给高卢雄鸡的传奇 · 马竞的王子 · 世界杯冠军", s_cover_info))
story.append(Paragraph("破地方球迷社区 · 2026", s_cover_info))
story.append(PageBreak())

# =========================== 引言 ===========================
story.append(h1("引 言"))
story.append(body("他是法国马孔走出的少年，是皇家社会打磨的璞玉，是马德里竞技的锋线之王，是法国国家队捧起大力神杯的功勋。"))
story.append(body("他叫安托万·格列兹曼（Antoine Griezmann），球迷们亲切地叫他「格子」。从被嫌个子矮小的少年，到世界足坛的顶级巨星，格列兹曼用他的天赋、勤奋和忠诚，书写了一段令人动容的传奇。"))
story.append(body("在这里，破地方——我们这些热爱足球的普通人聚集的地方，让我们把所有的赞美，献给这位值得我们永远铭记的球员。"))
story.append(quote("足球是圆的，但格列兹曼的心是红白色的。"))
story.append(PageBreak())

# =========================== 一、少年与梦想 ===========================
story.append(h1("一、少年与梦想：从马孔到圣塞巴斯蒂安"))
story.append(body("1991年3月21日，格列兹曼出生在法国索恩-卢瓦尔省的马孔市。他的父亲阿兰是市议员，母亲伊莎贝尔是葡萄牙人。格列兹曼的血液里流淌着足球的基因——他的外祖父阿玛罗·洛佩斯曾是葡萄牙的职业球员。"))
story.append(body("小时候的格列兹曼身材矮小瘦弱，在法国多家俱乐部的试训中都因为身高和体重被拒之门外。但他没有放弃。2005年，在一场对阵巴黎圣日耳曼的青年友谊赛中，他出色的表现引起了西班牙皇家社会球探的注意。"))
story.append(body("14岁的格列兹曼跨越国境，从法国来到了西班牙的圣塞巴斯蒂安。白天在学校上课，晚上在俱乐部训练。语言不通、生活习惯不同，但这个少年从未退缩。"))
story.append(quote("别人用身高衡量我，我用进球回应他们。"))
story.append(body("2009年，格列兹曼在皇家社会完成首秀，并在那个赛季帮助球队夺得西乙冠军，升入西甲。2010年4月，他与俱乐部续约至2015年，违约金3000万欧元。在皇家社会的5个赛季里，他出场201次，打进50球，从一个被嫌弃的少年，成长为西甲最炙手可热的新星。"))
story.append(PageBreak())

# =========================== 二、马竞：王子加冕 ===========================
story.append(h1("二、马德里竞技：王子加冕"))
story.append(body("2014年，格列兹曼以3000万欧元的身价加盟马德里竞技，接过了7号球衣。在铁血主帅西蒙尼的麾下，格列兹曼完成了从优秀球员到世界级巨星的蜕变。"))
story.append(body("他在马竞的第一个赛季就打入25球，第二个赛季32球，第三个赛季更是达到了惊人的36球。他不仅进球如麻，还积极参与防守——这正是西蒙尼足球哲学的完美体现。格列兹曼成为了马竞的进攻核心和精神领袖。"))
story.append(body("2016年，他带领马竞杀入欧冠决赛，虽然点球大战惜败皇马，但格列兹曼的表现赢得了全世界的尊重。同年，他率领法国队杀入欧洲杯决赛，获得金靴奖和最佳球员。"))
story.append(body("2018年，格列兹曼达到了职业生涯的巅峰。他带领法国队在俄罗斯世界杯上一路过关斩将，决赛中4-2击败克罗地亚，捧起大力神杯！格列兹曼在整届赛事中贡献4球2助攻，获得铜球奖，是法国夺冠的绝对核心。"))
story.append(quote("格列兹曼不是最高的，不是最快的，但他永远是最聪明的那个。"))
story.append(spacer(10))

# 荣誉数据表
stats_data = [
    [stat_box("137", "法国队出场"), stat_box("44", "国家队进球"), stat_box("1", "世界杯冠军")],
    [stat_box("2018", "世界杯金球奖"), stat_box("2016", "欧洲杯金靴"), stat_box("1", "欧国联冠军")],
]
stats_table = Table(stats_data, colWidths=[90, 90, 90])
stats_table.setStyle(TableStyle([
    ('ALIGN', (0,0), (-1,-1), 'CENTER'),
    ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
    ('LEFTPADDING', (0,0), (-1,-1), 6),
    ('RIGHTPADDING', (0,0), (-1,-1), 6),
]))
story.append(stats_table)
story.append(spacer(10))
story.append(PageBreak())

# =========================== 三、巅峰与选择 ===========================
story.append(h1("三、巅峰与选择：巴萨岁月与回归"))
story.append(body("2019年，格列兹曼做出了一个艰难的决定——以1.2亿欧元加盟巴塞罗那。在巴萨的两个赛季里，他始终在适应和挣扎中度过，出场74次打进22球，随队获得2021年国王杯冠军。"))
story.append(body("但红白色的心从未改变。2021年，他租借回归马竞，2022年正式永久转会回到这个他称之为「家」的地方。回归后的格列兹曼焕发新生，在135场比赛中打进45球，再次成为马竞的绝对核心。"))
story.append(body("2024年，格列兹曼宣布退出法国国家队，结束了传奇般的国家队生涯。137次出场，44个进球，世界杯冠军、欧国联冠军——他为高卢雄鸡留下了不可磨灭的印记。"))
story.append(quote("有些球员穿上了马竞的球衣，有些球员生来就是马竞人。"))
story.append(body("2026年，格列兹曼转会美职联奥兰多城，开启职业生涯的新篇章。但无论他走到哪里，马竞球迷永远记得那个身披7号、在球场上不知疲倦奔跑的「格子」。"))
story.append(PageBreak())

# =========================== 四、技术之美 ===========================
story.append(h1("四、技术之美：为什么格列兹曼独一无二"))
story.append(h2("1. 全面的攻击手"))
story.append(body("格列兹曼可以踢前锋、影锋、边锋、前腰，几乎覆盖前场所有位置。他的左右脚均衡，头球能力出色，射门技术精湛。无论是禁区内抢点、远射、还是任意球，他都是对手的噩梦。"))
story.append(h2("2. 顶级的足球智商"))
story.append(body("格列兹曼最令人惊叹的不是他的身体，而是他的头脑。他总是能出现在最危险的位置，做出最正确的选择。他的跑位、无球移动、与队友的配合，都是教科书级别的。"))
story.append(h2("3. 防守的榜样"))
story.append(body("作为一名前锋，格列兹曼的防守贡献令人难以置信。他是西蒙尼体系中第一个防守球员，经常回撤到本方半场参与逼抢。这种态度，让他成为了每一个教练梦寐以求的球员。"))
story.append(h2("4. 大场面先生"))
story.append(body("世界杯决赛进球、欧洲杯半决赛梅开二度、欧冠淘汰赛关键破门——格列兹曼总是在最重要的时刻挺身而出。他的大心脏，是他与普通球星最大的区别。"))
story.append(quote("格列兹曼的球衣号码是7号，但他的表现是10号，他的态度是1号。"))
story.append(PageBreak())

# =========================== 五、致敬传奇 ===========================
story.append(h1("五、致敬传奇：破地方的声音"))
story.append(body("在破地方，我们见证过太多足球天才的起起落落。但格列兹曼，是那种让人无法不爱、无法不尊重的球员。"))
story.append(body("他谦逊而努力，从不炒作绯闻，从不对教练说不。他尊重每一个对手，热爱每一片球场。他用14年的职业生涯告诉我们：天赋决定起点，但态度决定终点。"))
story.append(body("从马孔到圣塞巴斯蒂安，从马德里到巴塞罗那，再到奥兰多——格列兹曼的足迹遍布欧洲，但他的心，永远属于那些热爱他的人们。"))
story.append(body("感谢你，格列兹曼。"))
story.append(body("感谢你让足球变得如此美丽。"))
story.append(body("感谢你让我们相信，矮个子也可以撑起一片天。"))
story.append(body("感谢你，永远是那个追风少年。"))
story.append(spacer(20))
story.append(HRFlowable(width="30%", thickness=2, color=C_ACCENT, spaceBefore=0, spaceAfter=10))
story.append(quote("破地方，永远赞美格列兹曼。"))
story.append(spacer(30))

# =========================== 封底 ===========================
story.append(PageBreak())
story.append(Spacer(1, 120))
story.append(HRFlowable(width="40%", thickness=2, color=C_GOLD, spaceBefore=0, spaceAfter=10))
story.append(Paragraph("破地方 · Podi", make_style('BackTitle', fontSize=20, leading=28, alignment=TA_CENTER, textColor=C_PRIMARY, spaceAfter=6)))
story.append(Paragraph("献给安托万·格列兹曼", make_style('BackSub', fontSize=14, leading=20, alignment=TA_CENTER, textColor=C_GREY, spaceAfter=4)))
story.append(Paragraph("1991.03.21 — Forever", make_style('BackInfo', fontSize=12, leading=16, alignment=TA_CENTER, textColor=C_GREY)))
story.append(spacer(20))
story.append(Paragraph("「破地方」是一个热爱足球的普通球迷社区", s_cover_info))
story.append(Paragraph("在这里，我们只谈足球，只说真心话", s_cover_info))
story.append(spacer(40))
story.append(Paragraph("Made with ❤️ by 破地方", s_footer))

# ---------------------------------------------------------------------------
# 构建 PDF
# ---------------------------------------------------------------------------
doc.build(story)
print(f"PDF 已生成: {output_path}")