from datetime import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text, JSON
from sqlalchemy.orm import relationship

from app.database import Base


class Customer(Base):
    __tablename__ = "customers"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    code = Column(String, unique=True)
    locale = Column(String, default="en-US")
    timezone = Column(String, default="UTC")
    created_at = Column(DateTime, default=datetime.utcnow)

    sites = relationship("Site", back_populates="customer")


class Site(Base):
    __tablename__ = "sites"

    id = Column(Integer, primary_key=True)
    customer_id = Column(Integer, ForeignKey("customers.id"))
    name = Column(String, nullable=False)
    location = Column(String)
    timezone = Column(String)

    customer = relationship("Customer", back_populates="sites")
    devices = relationship("Device", back_populates="site")


class Device(Base):
    __tablename__ = "devices"

    id = Column(Integer, primary_key=True)
    site_id = Column(Integer, ForeignKey("sites.id"))
    name = Column(String, nullable=False)
    management_endpoint = Column(String, nullable=False)  # IP, hostname, or tunnel address
    role = Column(String)  # standalone, ems, ha-active, ha-standby
    ha_pair_id = Column(Integer, nullable=True)
    locked = Column(Boolean, default=False)
    tags = Column(JSON, default=list)
    created_at = Column(DateTime, default=datetime.utcnow)

    site = relationship("Site", back_populates="devices")


class CertificateRequest(Base):
    __tablename__ = "certificate_requests"

    id = Column(Integer, primary_key=True)
    device_id = Column(Integer, ForeignKey("devices.id"))
    status = Column(String, default="draft")  # draft, csr_generated, awaiting_upload, uploaded, applied, completed, failed, expired, cancelled
    csr_pem = Column(Text)
    signed_cert_pem = Column(Text)
    temp_token = Column(String, unique=True)
    temp_token_expires = Column(DateTime)
    notes = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Snapshot(Base):
    __tablename__ = "snapshots"

    id = Column(Integer, primary_key=True)
    device_id = Column(Integer, ForeignKey("devices.id"))
    label = Column(String)
    data = Column(JSON)  # full config dump
    created_at = Column(DateTime, default=datetime.utcnow)
    trigger = Column(String)  # manual, pre-change, scheduled
