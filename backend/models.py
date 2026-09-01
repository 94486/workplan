"""数据模型：请求/响应参数校验（Pydantic v2）。"""

from typing import Optional
from pydantic import BaseModel, Field, field_validator
from datetime import date


class WorkCreate(BaseModel):
    """新建工作请求体。"""
    name: str = Field(..., min_length=1, max_length=100, description="工作名称")
    work_type: str = Field("regular", pattern="^(regular|other)$", description="工作类型")
    duration_hours: float = Field(0, ge=0, le=10000, description="花费时长(小时)")
    planned_date: str = Field(..., description="计划完成日期 YYYY-MM-DD")
    expected_income: float = Field(0, ge=0, le=10_000_000, description="预期收入(元)")
    notes: str = Field("", max_length=2000, description="备注")

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


class PresetUpdate(BaseModel):
    """编辑预设请求体（全部可选）。"""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    work_type: Optional[str] = Field(None, pattern="^(regular|other)$")
    duration_hours: Optional[float] = Field(None, ge=0, le=10000)
    expected_income: Optional[float] = Field(None, ge=0, le=10_000_000)
    notes: Optional[str] = Field(None, max_length=2000)
