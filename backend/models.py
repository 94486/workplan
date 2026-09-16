"""数据模型：请求/响应参数校验（Pydantic v2）。"""

from typing import Optional
from pydantic import BaseModel, ConfigDict, Field, field_validator
from datetime import date


def _strip_name(v):
    """名称去首尾空格；全空格视为非法（None 原样返回，供 Update 模型使用）。"""
    if v is None:
        return None
    v = v.strip()
    if not v:
        raise ValueError("名称不能为空或全为空白字符")
    return v


class WorkCreate(BaseModel):
    """新建工作请求体。"""
    name: str = Field(..., min_length=1, max_length=100, description="工作名称")
    work_type: str = Field("regular", pattern="^(regular|other)$", description="工作类型")
    duration_hours: float = Field(0, ge=0, le=10000, description="花费时长(小时)")
    planned_date: str = Field(..., description="计划完成日期 YYYY-MM-DD")
    expected_income: float = Field(0, ge=0, le=10_000_000, description="预期收入(元)")
    notes: str = Field("", max_length=2000, description="备注")

    @field_validator("name")
    @classmethod
    def strip_name(cls, v):
        return _strip_name(v)

    @field_validator("planned_date")
    @classmethod
    def check_date(cls, v: str) -> str:
        date.fromisoformat(v)  # 非法格式直接抛异常
        return v


class WorkUpdate(BaseModel):
    """编辑待完成工作请求体（全部可选，仅传需要修改的字段）。"""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    work_type: Optional[str] = Field(None, pattern="^(regular|other)$")
    duration_hours: Optional[float] = Field(None, ge=0, le=10000)
    planned_date: Optional[str] = None
    expected_income: Optional[float] = Field(None, ge=0, le=10_000_000)
    notes: Optional[str] = Field(None, max_length=2000)

    @field_validator("name")
    @classmethod
    def strip_name(cls, v):
        return _strip_name(v)

    @field_validator("planned_date")
    @classmethod
    def check_date(cls, v):
        if v is None:
            return v
        date.fromisoformat(v)
        return v


class WorkComplete(BaseModel):
    """标记完成请求体：可同时提供实际花费时长、完成日期、实际收入。"""
    actual_duration_hours: Optional[float] = Field(None, ge=0, le=10000, description="实际花费时长")
    completed_date: Optional[str] = Field(None, description="完成日期，默认今天")
    actual_income: Optional[float] = Field(None, ge=0, le=10_000_000, description="实际收入")

    @field_validator("completed_date")
    @classmethod
    def check_date(cls, v):
        if v is None:
            return v
        date.fromisoformat(v)
        return v


class WorkReopen(BaseModel):
    """重新打开（恢复为待完成）。"""
    pass


class PresetCreate(BaseModel):
    """新建预设请求体（常规工作和其他工作各自独立维护预设）。"""
    name: str = Field(..., min_length=1, max_length=100, description="预设名称")
    work_type: str = Field("regular", pattern="^(regular|other)$", description="工作类型")
    duration_hours: float = Field(0, ge=0, le=10000, description="花费时长(小时)")
    expected_income: float = Field(0, ge=0, le=10_000_000, description="预期收入(元)")
    notes: str = Field("", max_length=2000, description="备注")

    @field_validator("name")
    @classmethod
    def strip_name(cls, v):
        return _strip_name(v)


class PresetUpdate(BaseModel):
    """编辑预设请求体（全部可选）。"""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    work_type: Optional[str] = Field(None, pattern="^(regular|other)$")
    duration_hours: Optional[float] = Field(None, ge=0, le=10000)
    expected_income: Optional[float] = Field(None, ge=0, le=10_000_000)
    notes: Optional[str] = Field(None, max_length=2000)

    @field_validator("name")
    @classmethod
    def strip_name(cls, v):
        return _strip_name(v)


# ============================================================
# 月薪模式模型（无每日收入字段，任务与收入完全独立）
# ============================================================

class MonthlyWorkCreate(BaseModel):
    """新建月薪任务请求体（无收入字段）。"""
    model_config = ConfigDict(extra="forbid")  # 拒绝误传收入等额外字段，保证与日薪数据隔离
    name: str = Field(..., min_length=1, max_length=100, description="工作名称")
    work_type: str = Field("regular", pattern="^(regular|other)$", description="工作类型")
    duration_hours: float = Field(0, ge=0, le=10000, description="花费时长(小时)")
    planned_date: str = Field(..., description="计划完成日期 YYYY-MM-DD")
    notes: str = Field("", max_length=2000, description="备注")

    @field_validator("name")
    @classmethod
    def strip_name(cls, v):
        return _strip_name(v)

    @field_validator("planned_date")
    @classmethod
    def check_date(cls, v: str) -> str:
        date.fromisoformat(v)
        return v


class MonthlyWorkUpdate(BaseModel):
    """编辑月薪任务请求体（全部可选，无收入字段）。"""
    model_config = ConfigDict(extra="forbid")
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    work_type: Optional[str] = Field(None, pattern="^(regular|other)$")
    duration_hours: Optional[float] = Field(None, ge=0, le=10000)
    planned_date: Optional[str] = None
    notes: Optional[str] = Field(None, max_length=2000)

    @field_validator("name")
    @classmethod
    def strip_name(cls, v):
        return _strip_name(v)

    @field_validator("planned_date")
    @classmethod
    def check_date(cls, v):
        if v is None:
            return v
        date.fromisoformat(v)
        return v


class MonthlyWorkComplete(BaseModel):
    """标记完成月薪任务：实际时长 + 完成日期（无实际收入）。"""
    actual_duration_hours: Optional[float] = Field(None, ge=0, le=10000, description="实际花费时长")
    completed_date: Optional[str] = Field(None, description="完成日期，默认今天")

    @field_validator("completed_date")
    @classmethod
    def check_date(cls, v):
        if v is None:
            return v
        date.fromisoformat(v)
        return v


class MonthlyPresetCreate(BaseModel):
    """新建月薪预设请求体（无收入字段）。"""
    model_config = ConfigDict(extra="forbid")
    name: str = Field(..., min_length=1, max_length=100, description="预设名称")
    work_type: str = Field("regular", pattern="^(regular|other)$", description="工作类型")
    duration_hours: float = Field(0, ge=0, le=10000, description="花费时长(小时)")
    notes: str = Field("", max_length=2000, description="备注")

    @field_validator("name")
    @classmethod
    def strip_name(cls, v):
        return _strip_name(v)


class MonthlyPresetUpdate(BaseModel):
    """编辑月薪预设请求体（全部可选）。"""
    model_config = ConfigDict(extra="forbid")
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    work_type: Optional[str] = Field(None, pattern="^(regular|other)$")
    duration_hours: Optional[float] = Field(None, ge=0, le=10000)
    notes: Optional[str] = Field(None, max_length=2000)

    @field_validator("name")
    @classmethod
    def strip_name(cls, v):
        return _strip_name(v)


class MonthlySettingsUpdate(BaseModel):
    """月薪收入配置：上月常规收入 + 上月其它收入。"""
    month_key: Optional[str] = Field(None, pattern=r"^\d{4}-(0[1-9]|1[0-2])$", description="对应月份 YYYY-MM")
    regular_income: Optional[float] = Field(None, ge=0, le=10_000_000, description="上月常规工作收入(元)")
    other_income: Optional[float] = Field(None, ge=0, le=10_000_000, description="上月其它工作收入(元)")
